#include "pluginterfaces/base/ibstream.h"
#include "pluginterfaces/base/ipluginbase.h"
#include "pluginterfaces/gui/iplugview.h"
#include "pluginterfaces/gui/iplugviewcontentscalesupport.h"
#include "pluginterfaces/vst/ivstaudioprocessor.h"
#include "pluginterfaces/vst/ivstcomponent.h"
#include "pluginterfaces/vst/ivsteditcontroller.h"
#include "pluginterfaces/vst/ivstevents.h"
#include "pluginterfaces/vst/ivsthostapplication.h"
#include "pluginterfaces/vst/ivstmessage.h"
#include "pluginterfaces/vst/ivstparameterchanges.h"
#include "pluginterfaces/vst/ivstprocesscontext.h"
#include "pluginterfaces/vst/ivstunits.h"
#include "pluginterfaces/vst/vstspeaker.h"

#include <windows.h>

#include <algorithm>
#include <array>
#include <atomic>
#include <chrono>
#include <cstdint>
#include <cstring>
#include <memory>
#include <mutex>
#include <string>
#include <vector>

namespace {

constexpr std::uint32_t kSharedMagic = 0x50445633; // PDV3
constexpr std::uint32_t kSharedVersion = 1;
constexpr std::uint32_t kMaxFrames = 128;
constexpr std::uint32_t kMaxEvents = 256;
constexpr std::uint32_t kMaxParameters = 256;
constexpr std::uint32_t kStateLimit = 32u * 1024u * 1024u;
constexpr Steinberg::int32 kMaxReportedAudioBuses = 64;
constexpr Steinberg::int32 kMaxReportedProgramLists = 256;
constexpr Steinberg::int32 kMaxReportedPrograms = 4096;
constexpr Steinberg::int32 kMaxReportedControllerParameters = 4096;
constexpr std::uint32_t kMaxReportedLatencySamples = 262144;
constexpr std::uint32_t kMaxReportedTailSamples = 5760000;
constexpr std::uint32_t kProcessOk = 0;
constexpr std::uint32_t kProcessInvalid = 1;
constexpr std::uint32_t kProcessPluginFailure = 2;
constexpr std::uint32_t kProcessDeadlineMiss = 3;

struct SharedEvent {
    std::uint32_t kind; // 0 note-on, 1 note-off
    std::uint32_t sample_offset;
    std::int32_t note_id;
    std::int16_t channel;
    std::int16_t pitch;
    float value;
    float tuning;
};

struct SharedParameter {
    std::uint32_t parameter_id;
    std::uint32_t sample_offset;
    double value;
};

struct SharedSessionMemory {
    std::uint32_t magic;
    std::uint32_t version;
    std::uint32_t total_bytes;
    std::uint32_t max_frames;
    std::uint32_t frame_count;
    std::uint32_t input_channels;
    std::uint32_t output_channels;
    std::uint32_t event_count;
    std::uint32_t parameter_count;
    std::uint32_t state_size;
    std::uint32_t transport_flags; // playing=1, recording=2, looping=4
    std::uint32_t process_status;
    std::int64_t project_time_samples;
    std::int64_t continuous_time_samples;
    double sample_rate;
    double project_ppq;
    double bar_position_ppq;
    double loop_start_ppq;
    double loop_end_ppq;
    double tempo;
    std::int32_t time_signature_numerator;
    std::int32_t time_signature_denominator;
    std::uint64_t elapsed_micros;
    float input[2][kMaxFrames];
    float output[2][kMaxFrames];
    SharedEvent events[kMaxEvents];
    SharedParameter parameters[kMaxParameters];
    std::uint8_t state[kStateLimit];
};

struct SessionInfo {
    std::uint32_t role; // 1 instrument, 2 effect
    std::uint32_t input_channels;
    std::uint32_t output_channels;
    std::uint32_t event_input_buses;
    std::uint32_t latency_samples;
    std::uint32_t tail_samples;
    std::uint32_t state_limit_bytes;
    std::uint32_t shared_memory_bytes;
};

struct ParameterDescriptor {
    std::uint32_t parameter_id;
    char title[129];
    char short_title[65];
    char units[65];
    std::int32_t step_count;
    double default_normalized;
    double current_normalized;
    std::uint32_t flags;
};

struct ProgramDescriptor {
    std::int32_t list_id;
    std::int32_t program_index;
    char list_name[129];
    char program_name[129];
};

struct ParameterEdit {
    std::uint32_t parameter_id;
    double value;
};

using GetFactoryProc = Steinberg::IPluginFactory* (PLUGIN_API*)();
using InitModuleProc = bool (PLUGIN_API*)();
using ExitModuleProc = bool (PLUGIN_API*)();

struct Session;
void close_editor(Session* session);
bool result_ok(Steinberg::tresult result);

bool iid_equal(const Steinberg::TUID left, const Steinberg::TUID right) {
    return std::memcmp(left, right, sizeof(Steinberg::TUID)) == 0;
}

void copy_utf16(char* output, std::size_t capacity, const Steinberg::char16* input,
                std::size_t input_capacity) {
    if (!output || capacity == 0) return;
    output[0] = 0;
    std::size_t length = 0;
    while (input && length < input_capacity && input[length] != 0) ++length;
    if (length == 0) return;
    const auto required = WideCharToMultiByte(CP_UTF8, WC_ERR_INVALID_CHARS,
        reinterpret_cast<const wchar_t*>(input), static_cast<int>(length), nullptr, 0, nullptr, nullptr);
    if (required <= 0) return;
    std::string utf8(static_cast<std::size_t>(required), '\0');
    if (WideCharToMultiByte(CP_UTF8, WC_ERR_INVALID_CHARS,
            reinterpret_cast<const wchar_t*>(input), static_cast<int>(length), utf8.data(), required,
            nullptr, nullptr) <= 0) return;
    const auto count = (std::min)(utf8.size(), capacity - 1);
    std::memcpy(output, utf8.data(), count); output[count] = 0;
}

class HostApplication final : public Steinberg::Vst::IHostApplication {
public:
    Steinberg::tresult PLUGIN_API queryInterface(const Steinberg::TUID iid, void** object) override {
        if (!object) return Steinberg::kInvalidArgument;
        *object = nullptr;
        if (iid_equal(iid, Steinberg::FUnknown_iid) ||
            iid_equal(iid, Steinberg::Vst::IHostApplication_iid)) {
            *object = static_cast<Steinberg::Vst::IHostApplication*>(this);
            addRef();
            return Steinberg::kResultOk;
        }
        return Steinberg::kNoInterface;
    }
    Steinberg::uint32 PLUGIN_API addRef() override { return ++references_; }
    Steinberg::uint32 PLUGIN_API release() override {
        const auto value = --references_;
        if (value == 0) delete this;
        return value;
    }
    Steinberg::tresult PLUGIN_API getName(Steinberg::Vst::String128 name) override {
        const wchar_t* source = L"Pocket DAW";
        std::wcsncpy(reinterpret_cast<wchar_t*>(name), source, 127);
        name[127] = 0;
        return Steinberg::kResultOk;
    }
    Steinberg::tresult PLUGIN_API createInstance(Steinberg::TUID, Steinberg::TUID, void** object) override {
        if (object) *object = nullptr;
        return Steinberg::kNoInterface;
    }
private:
    std::atomic<Steinberg::uint32> references_ {1};
};

class ComponentHandler final : public Steinberg::Vst::IComponentHandler {
public:
    Steinberg::tresult PLUGIN_API queryInterface(const Steinberg::TUID requested, void** object) override {
        if (!object) return Steinberg::kInvalidArgument; *object = nullptr;
        if (iid_equal(requested, Steinberg::FUnknown_iid) ||
            iid_equal(requested, Steinberg::Vst::IComponentHandler_iid)) {
            *object = static_cast<Steinberg::Vst::IComponentHandler*>(this); addRef(); return Steinberg::kResultOk;
        }
        return Steinberg::kNoInterface;
    }
    Steinberg::uint32 PLUGIN_API addRef() override { return ++references_; }
    Steinberg::uint32 PLUGIN_API release() override { return --references_; }
    Steinberg::tresult PLUGIN_API beginEdit(Steinberg::Vst::ParamID) override { return Steinberg::kResultOk; }
    Steinberg::tresult PLUGIN_API performEdit(Steinberg::Vst::ParamID id, Steinberg::Vst::ParamValue value) override {
        if (value < 0.0 || value > 1.0 || !audio_edits_.push(id, value) || !control_edits_.push(id, value))
            return Steinberg::kResultFalse;
        return Steinberg::kResultOk;
    }
    Steinberg::tresult PLUGIN_API endEdit(Steinberg::Vst::ParamID) override { return Steinberg::kResultOk; }
    Steinberg::tresult PLUGIN_API restartComponent(Steinberg::int32 flags) override {
        restart_flags_.fetch_or(static_cast<std::uint32_t>(flags)); return Steinberg::kResultOk;
    }
    std::uint32_t take_restart_flags() { return restart_flags_.exchange(0); }
    bool pop_audio(ParameterEdit& edit) { return audio_edits_.pop(edit); }
    bool pop_control(ParameterEdit& edit) { return control_edits_.pop(edit); }
private:
    struct EditSlot { std::atomic<std::uint32_t> id {0}; std::atomic<std::uint64_t> value {0}; };
    class EditQueue {
    public:
        bool push(std::uint32_t id, double value) {
            const auto write = write_.load(std::memory_order_relaxed);
            if (write - read_.load(std::memory_order_acquire) >= slots_.size()) return false;
            auto& slot = slots_[write % slots_.size()];
            slot.id.store(id, std::memory_order_relaxed);
            std::uint64_t bits = 0; std::memcpy(&bits, &value, sizeof(value));
            slot.value.store(bits, std::memory_order_relaxed);
            write_.store(write + 1, std::memory_order_release); return true;
        }
        bool pop(ParameterEdit& edit) {
            const auto read = read_.load(std::memory_order_relaxed);
            if (read == write_.load(std::memory_order_acquire)) return false;
            auto& slot = slots_[read % slots_.size()];
            edit.parameter_id = slot.id.load(std::memory_order_relaxed);
            const auto bits = slot.value.load(std::memory_order_relaxed);
            std::memcpy(&edit.value, &bits, sizeof(bits));
            read_.store(read + 1, std::memory_order_release); return true;
        }
    private:
        std::array<EditSlot, 1024> slots_ {};
        std::atomic<std::size_t> write_ {0}; std::atomic<std::size_t> read_ {0};
    };
    std::atomic<Steinberg::uint32> references_ {1};
    std::atomic<std::uint32_t> restart_flags_ {0};
    EditQueue audio_edits_; EditQueue control_edits_;
};

class MemoryStream final : public Steinberg::IBStream {
public:
    explicit MemoryStream(std::vector<std::uint8_t> bytes = {}) : bytes_(std::move(bytes)) {}
    Steinberg::tresult PLUGIN_API queryInterface(const Steinberg::TUID iid, void** object) override {
        if (!object) return Steinberg::kInvalidArgument;
        *object = nullptr;
        if (iid_equal(iid, Steinberg::FUnknown_iid) || iid_equal(iid, Steinberg::IBStream_iid)) {
            *object = static_cast<Steinberg::IBStream*>(this);
            addRef();
            return Steinberg::kResultOk;
        }
        return Steinberg::kNoInterface;
    }
    Steinberg::uint32 PLUGIN_API addRef() override { return ++references_; }
    Steinberg::uint32 PLUGIN_API release() override { return --references_; }
    Steinberg::tresult PLUGIN_API read(void* output, Steinberg::int32 count,
                                       Steinberg::int32* read_count) override {
        if (!output || count < 0) return Steinberg::kInvalidArgument;
        const auto available = position_ < bytes_.size() ? bytes_.size() - position_ : 0;
        const auto count_read = (std::min)(static_cast<std::size_t>(count), available);
        if (count_read != 0) std::memcpy(output, bytes_.data() + position_, count_read);
        position_ += count_read;
        if (read_count) *read_count = static_cast<Steinberg::int32>(count_read);
        return Steinberg::kResultOk;
    }
    Steinberg::tresult PLUGIN_API write(void* input, Steinberg::int32 count,
                                        Steinberg::int32* written_count) override {
        if (!input || count < 0) return Steinberg::kInvalidArgument;
        const auto requested = static_cast<std::size_t>(count);
        if (requested > kStateLimit || position_ > kStateLimit - requested)
            return Steinberg::kOutOfMemory;
        if (bytes_.size() < position_ + requested) bytes_.resize(position_ + requested);
        std::memcpy(bytes_.data() + position_, input, requested);
        position_ += requested;
        if (written_count) *written_count = count;
        return Steinberg::kResultOk;
    }
    Steinberg::tresult PLUGIN_API seek(Steinberg::int64 offset, Steinberg::int32 mode,
                                       Steinberg::int64* result) override {
        Steinberg::int64 base = mode == kIBSeekCur ? static_cast<Steinberg::int64>(position_)
            : mode == kIBSeekEnd ? static_cast<Steinberg::int64>(bytes_.size()) : 0;
        if (offset < -base || base + offset < 0 || static_cast<std::uint64_t>(base + offset) > kStateLimit)
            return Steinberg::kInvalidArgument;
        position_ = static_cast<std::size_t>(base + offset);
        if (result) *result = static_cast<Steinberg::int64>(position_);
        return Steinberg::kResultOk;
    }
    Steinberg::tresult PLUGIN_API tell(Steinberg::int64* result) override {
        if (!result) return Steinberg::kInvalidArgument;
        *result = static_cast<Steinberg::int64>(position_);
        return Steinberg::kResultOk;
    }
    const std::vector<std::uint8_t>& bytes() const { return bytes_; }
private:
    std::atomic<Steinberg::uint32> references_ {1};
    std::vector<std::uint8_t> bytes_;
    std::size_t position_ {0};
};

class EventList final : public Steinberg::Vst::IEventList {
public:
    void reset() { count_ = 0; }
    bool append(const Steinberg::Vst::Event& event) {
        if (count_ >= static_cast<Steinberg::int32>(events_.size())) return false;
        events_[count_++] = event;
        return true;
    }
    Steinberg::tresult PLUGIN_API queryInterface(const Steinberg::TUID iid, void** object) override {
        if (!object) return Steinberg::kInvalidArgument;
        *object = nullptr;
        if (iid_equal(iid, Steinberg::FUnknown_iid) || iid_equal(iid, Steinberg::Vst::IEventList_iid)) {
            *object = static_cast<Steinberg::Vst::IEventList*>(this);
            return Steinberg::kResultOk;
        }
        return Steinberg::kNoInterface;
    }
    Steinberg::uint32 PLUGIN_API addRef() override { return 1; }
    Steinberg::uint32 PLUGIN_API release() override { return 1; }
    Steinberg::int32 PLUGIN_API getEventCount() override { return count_; }
    Steinberg::tresult PLUGIN_API getEvent(Steinberg::int32 index, Steinberg::Vst::Event& event) override {
        if (index < 0 || index >= count_) return Steinberg::kInvalidArgument;
        event = events_[index];
        return Steinberg::kResultOk;
    }
    Steinberg::tresult PLUGIN_API addEvent(Steinberg::Vst::Event& event) override {
        return append(event) ? Steinberg::kResultOk : Steinberg::kOutOfMemory;
    }
private:
    std::array<Steinberg::Vst::Event, kMaxEvents> events_ {};
    Steinberg::int32 count_ {0};
};

class ParamQueue final : public Steinberg::Vst::IParamValueQueue {
public:
    void reset(Steinberg::Vst::ParamID id) { id_ = id; count_ = 0; }
    Steinberg::tresult PLUGIN_API queryInterface(const Steinberg::TUID iid, void** object) override {
        if (!object) return Steinberg::kInvalidArgument;
        *object = nullptr;
        if (iid_equal(iid, Steinberg::FUnknown_iid) || iid_equal(iid, Steinberg::Vst::IParamValueQueue_iid)) {
            *object = static_cast<Steinberg::Vst::IParamValueQueue*>(this);
            return Steinberg::kResultOk;
        }
        return Steinberg::kNoInterface;
    }
    Steinberg::uint32 PLUGIN_API addRef() override { return 1; }
    Steinberg::uint32 PLUGIN_API release() override { return 1; }
    Steinberg::Vst::ParamID PLUGIN_API getParameterId() override { return id_; }
    Steinberg::int32 PLUGIN_API getPointCount() override { return count_; }
    Steinberg::tresult PLUGIN_API getPoint(Steinberg::int32 index, Steinberg::int32& offset,
                                           Steinberg::Vst::ParamValue& value) override {
        if (index < 0 || index >= count_) return Steinberg::kInvalidArgument;
        offset = offsets_[index]; value = values_[index]; return Steinberg::kResultOk;
    }
    Steinberg::tresult PLUGIN_API addPoint(Steinberg::int32 offset, Steinberg::Vst::ParamValue value,
                                           Steinberg::int32& index) override {
        if (count_ >= static_cast<Steinberg::int32>(offsets_.size())) return Steinberg::kOutOfMemory;
        index = count_; offsets_[count_] = offset; values_[count_] = value; ++count_; return Steinberg::kResultOk;
    }
private:
    Steinberg::Vst::ParamID id_ {0};
    std::array<Steinberg::int32, kMaxParameters> offsets_ {};
    std::array<Steinberg::Vst::ParamValue, kMaxParameters> values_ {};
    Steinberg::int32 count_ {0};
};

class ParameterChanges final : public Steinberg::Vst::IParameterChanges {
public:
    void reset() { count_ = 0; }
    bool append(Steinberg::Vst::ParamID id, Steinberg::int32 offset, double value) {
        ParamQueue* queue = nullptr;
        for (Steinberg::int32 index = 0; index < count_; ++index)
            if (queues_[index].getParameterId() == id) queue = &queues_[index];
        if (!queue) {
            if (count_ >= static_cast<Steinberg::int32>(queues_.size())) return false;
            queue = &queues_[count_++]; queue->reset(id);
        }
        Steinberg::int32 point = 0;
        return queue->addPoint(offset, value, point) == Steinberg::kResultOk;
    }
    Steinberg::tresult PLUGIN_API queryInterface(const Steinberg::TUID iid, void** object) override {
        if (!object) return Steinberg::kInvalidArgument;
        *object = nullptr;
        if (iid_equal(iid, Steinberg::FUnknown_iid) || iid_equal(iid, Steinberg::Vst::IParameterChanges_iid)) {
            *object = static_cast<Steinberg::Vst::IParameterChanges*>(this); return Steinberg::kResultOk;
        }
        return Steinberg::kNoInterface;
    }
    Steinberg::uint32 PLUGIN_API addRef() override { return 1; }
    Steinberg::uint32 PLUGIN_API release() override { return 1; }
    Steinberg::int32 PLUGIN_API getParameterCount() override { return count_; }
    Steinberg::Vst::IParamValueQueue* PLUGIN_API getParameterData(Steinberg::int32 index) override {
        return index >= 0 && index < count_ ? &queues_[index] : nullptr;
    }
    Steinberg::Vst::IParamValueQueue* PLUGIN_API addParameterData(const Steinberg::Vst::ParamID& id,
                                                                  Steinberg::int32& index) override {
        if (count_ >= static_cast<Steinberg::int32>(queues_.size())) return nullptr;
        index = count_; queues_[count_].reset(id); return &queues_[count_++];
    }
private:
    std::array<ParamQueue, kMaxParameters> queues_ {};
    Steinberg::int32 count_ {0};
};

std::wstring module_binary_path(const wchar_t* module_path) {
    std::wstring path(module_path ? module_path : L"");
    if (path.empty()) return {};
    const auto attributes = GetFileAttributesW(path.c_str());
    if (attributes == INVALID_FILE_ATTRIBUTES) return {};
    if ((attributes & FILE_ATTRIBUTE_DIRECTORY) == 0) return path;
    const auto slash = path.find_last_of(L"\\/");
    const std::wstring filename = slash == std::wstring::npos ? path : path.substr(slash + 1);
    if (path.back() != L'\\' && path.back() != L'/') path.push_back(L'\\');
    return path.append(L"Contents\\x86_64-win\\").append(filename);
}

bool canonical_id_to_tuid(const char* value, Steinberg::TUID output) {
    if (!value || std::strlen(value) != 32) return false;
    std::uint8_t canonical[16] {};
    auto nibble = [](char c) -> int {
        if (c >= '0' && c <= '9') return c - '0';
        if (c >= 'a' && c <= 'f') return c - 'a' + 10;
        if (c >= 'A' && c <= 'F') return c - 'A' + 10;
        return -1;
    };
    for (std::size_t index = 0; index < 16; ++index) {
        const int high = nibble(value[index * 2]); const int low = nibble(value[index * 2 + 1]);
        if (high < 0 || low < 0) return false;
        canonical[index] = static_cast<std::uint8_t>((high << 4) | low);
    }
    static constexpr std::size_t order[16] = {3,2,1,0,5,4,7,6,8,9,10,11,12,13,14,15};
    for (std::size_t index = 0; index < 16; ++index) output[order[index]] = static_cast<char>(canonical[index]);
    return true;
}

struct Session {
    HMODULE library {nullptr};
    ExitModuleProc exit_proc {nullptr};
    Steinberg::IPluginFactory* factory {nullptr};
    Steinberg::Vst::IComponent* component {nullptr};
    Steinberg::Vst::IAudioProcessor* processor {nullptr};
    Steinberg::Vst::IEditController* controller {nullptr};
    Steinberg::Vst::IConnectionPoint* component_connection {nullptr};
    Steinberg::Vst::IConnectionPoint* controller_connection {nullptr};
    HostApplication* host {nullptr};
    ComponentHandler handler;
    Steinberg::IPlugView* view {nullptr};
    Steinberg::IPlugFrame* frame {nullptr};
    HWND editor_window {nullptr};
    bool initialized {false}; bool active {false}; bool processing {false};
    bool instrument {false}; std::uint32_t input_channels {0}; std::uint32_t output_channels {0};
    EventList events; ParameterChanges parameters;
    std::array<std::array<float, kMaxFrames>, 2> input {};
    std::array<std::array<float, kMaxFrames>, 2> output {};

    ~Session() {
        close_editor(this);
        if (component_connection && controller_connection) {
            component_connection->disconnect(controller_connection);
            controller_connection->disconnect(component_connection);
        }
        if (component_connection) component_connection->release();
        if (controller_connection) controller_connection->release();
        if (processor && processing) processor->setProcessing(false);
        if (component && active) component->setActive(false);
        if (component && initialized) component->terminate();
        if (controller) { controller->setComponentHandler(nullptr); controller->terminate(); controller->release(); }
        if (processor) processor->release();
        if (component) component->release();
        if (host) host->release();
        if (factory) factory->release();
        if (exit_proc) exit_proc();
        if (library) FreeLibrary(library);
    }
};

class PlugFrame final : public Steinberg::IPlugFrame {
public:
    explicit PlugFrame(Session* session) : session_(session) {}
    Steinberg::tresult PLUGIN_API queryInterface(const Steinberg::TUID requested, void** object) override {
        if (!object) return Steinberg::kInvalidArgument; *object = nullptr;
        if (iid_equal(requested, Steinberg::FUnknown_iid) || iid_equal(requested, Steinberg::IPlugFrame_iid)) {
            *object = static_cast<Steinberg::IPlugFrame*>(this); addRef(); return Steinberg::kResultOk;
        }
        return Steinberg::kNoInterface;
    }
    Steinberg::uint32 PLUGIN_API addRef() override { return ++references_; }
    Steinberg::uint32 PLUGIN_API release() override { const auto next=--references_; if(!next)delete this; return next; }
    Steinberg::tresult PLUGIN_API resizeView(Steinberg::IPlugView* view, Steinberg::ViewRect* rect) override {
        if (!session_ || view != session_->view || !rect || !session_->editor_window) return Steinberg::kInvalidArgument;
        Steinberg::ViewRect constrained = *rect;
        if (view->canResize() == Steinberg::kResultTrue) view->checkSizeConstraint(&constrained);
        RECT window_rect {0,0,constrained.getWidth(),constrained.getHeight()};
        AdjustWindowRectEx(&window_rect, WS_OVERLAPPEDWINDOW, FALSE, 0);
        SetWindowPos(session_->editor_window, nullptr, 0, 0,
            window_rect.right-window_rect.left, window_rect.bottom-window_rect.top,
            SWP_NOMOVE | SWP_NOZORDER | SWP_NOACTIVATE);
        return view->onSize(&constrained);
    }
private:
    std::atomic<Steinberg::uint32> references_ {1}; Session* session_ {nullptr};
};

void update_editor_scale(Session* session) {
    if (!session || !session->view || !session->editor_window) return;
    Steinberg::IPlugViewContentScaleSupport* scale = nullptr;
    if (result_ok(session->view->queryInterface(Steinberg::IPlugViewContentScaleSupport_iid,
            reinterpret_cast<void**>(&scale))) && scale) {
        const auto dpi = GetDpiForWindow(session->editor_window);
        scale->setContentScaleFactor(static_cast<float>(dpi ? dpi : 96) / 96.0f);
        scale->release();
    }
}

LRESULT CALLBACK editor_window_proc(HWND window, UINT message, WPARAM wparam, LPARAM lparam) {
    auto* session = reinterpret_cast<Session*>(GetWindowLongPtrW(window, GWLP_USERDATA));
    if (message == WM_NCCREATE) {
        auto* create = reinterpret_cast<CREATESTRUCTW*>(lparam);
        session = static_cast<Session*>(create->lpCreateParams);
        SetWindowLongPtrW(window, GWLP_USERDATA, reinterpret_cast<LONG_PTR>(session));
    }
    if (!session || !session->view) return DefWindowProcW(window, message, wparam, lparam);
    switch (message) {
        case WM_SIZE: {
            Steinberg::ViewRect rect {0,0,LOWORD(lparam),HIWORD(lparam)};
            session->view->onSize(&rect); return 0;
        }
        case WM_SETFOCUS: session->view->onFocus(true); return 0;
        case WM_KILLFOCUS: session->view->onFocus(false); return 0;
        case WM_DPICHANGED: {
            update_editor_scale(session);
            const auto* suggested = reinterpret_cast<const RECT*>(lparam);
            SetWindowPos(window, nullptr, suggested->left, suggested->top,
                suggested->right-suggested->left, suggested->bottom-suggested->top,
                SWP_NOZORDER | SWP_NOACTIVATE);
            return 0;
        }
        case WM_CLOSE: ShowWindow(window, SW_HIDE); return 0;
        default: return DefWindowProcW(window, message, wparam, lparam);
    }
}

bool ensure_editor_class() {
    static std::once_flag once;
    static bool ready = false;
    std::call_once(once, [] {
        WNDCLASSW window_class {};
        window_class.lpfnWndProc = editor_window_proc;
        window_class.hInstance = GetModuleHandleW(nullptr);
        window_class.lpszClassName = L"PocketDawVst3EditorWindow";
        window_class.hCursor = LoadCursorW(nullptr, IDC_ARROW);
        ready = RegisterClassW(&window_class) != 0 || GetLastError() == ERROR_CLASS_ALREADY_EXISTS;
    });
    return ready;
}

void close_editor(Session* session) {
    if (!session) return;
    if (session->view) {
        session->view->onFocus(false);
        session->view->removed();
        session->view->setFrame(nullptr);
        session->view->release();
        session->view = nullptr;
    }
    if (session->editor_window) {
        SetWindowLongPtrW(session->editor_window, GWLP_USERDATA, 0);
        DestroyWindow(session->editor_window); session->editor_window = nullptr;
    }
    if (session->frame) { session->frame->release(); session->frame = nullptr; }
}

bool result_ok(Steinberg::tresult result);

bool sync_controller_component_state(Session* session) {
    if (!session || !session->controller) return true;
    MemoryStream component_state;
    if (!result_ok(session->component->getState(&component_state))) return false;
    Steinberg::int64 ignored = 0;
    if (!result_ok(component_state.seek(0, Steinberg::IBStream::kIBSeekSet, &ignored))) return false;
    return result_ok(session->controller->setComponentState(&component_state));
}

bool result_ok(Steinberg::tresult result) {
    return result == Steinberg::kResultOk || result == Steinberg::kResultTrue;
}

void clear_output(SharedSessionMemory* shared) {
    if (!shared) return;
    std::memset(shared->output, 0, sizeof(shared->output));
}

} // namespace

extern "C" std::size_t pocket_daw_vst3_shared_memory_bytes() noexcept {
    return sizeof(SharedSessionMemory);
}

extern "C" std::uint32_t pocket_daw_vst3_shared_process_status(const void* raw_shared) noexcept {
    return raw_shared ? static_cast<const SharedSessionMemory*>(raw_shared)->process_status : kProcessInvalid;
}

extern "C" std::uint64_t pocket_daw_vst3_shared_elapsed_micros(const void* raw_shared) noexcept {
    return raw_shared ? static_cast<const SharedSessionMemory*>(raw_shared)->elapsed_micros : 0;
}

extern "C" std::uint32_t pocket_daw_vst3_shared_state_size(const void* raw_shared) noexcept {
    return raw_shared ? static_cast<const SharedSessionMemory*>(raw_shared)->state_size : 0;
}

extern "C" void* pocket_daw_vst3_session_create(const wchar_t* module_path, const char* class_id,
    double sample_rate, SessionInfo* info, int* error) noexcept {
    if (error) *error = 1;
    if (!module_path || !class_id || !info || sample_rate < 8000.0 || sample_rate > 384000.0) return nullptr;
    try {
        std::unique_ptr<Session> session(new Session());
        const auto binary = module_binary_path(module_path);
        if (binary.empty()) return nullptr;
        session->library = LoadLibraryExW(binary.c_str(), nullptr,
            LOAD_LIBRARY_SEARCH_DLL_LOAD_DIR | LOAD_LIBRARY_SEARCH_DEFAULT_DIRS);
        if (!session->library) return nullptr;
        session->exit_proc = reinterpret_cast<ExitModuleProc>(GetProcAddress(session->library, "ExitDll"));
        const auto init_proc = reinterpret_cast<InitModuleProc>(GetProcAddress(session->library, "InitDll"));
        if (init_proc && !init_proc()) return nullptr;
        const auto get_factory = reinterpret_cast<GetFactoryProc>(GetProcAddress(session->library, "GetPluginFactory"));
        if (!get_factory || !(session->factory = get_factory())) return nullptr;
        Steinberg::TUID cid {};
        if (!canonical_id_to_tuid(class_id, cid)) { if (error) *error = 2; return nullptr; }
        void* raw_component = nullptr;
        if (!result_ok(session->factory->createInstance(cid, Steinberg::Vst::IComponent_iid,
                &raw_component)) || !raw_component) { if (error) *error = 3; return nullptr; }
        session->component = static_cast<Steinberg::Vst::IComponent*>(raw_component);
        void* raw_processor = nullptr;
        if (!result_ok(session->component->queryInterface(Steinberg::Vst::IAudioProcessor_iid,
                &raw_processor)) || !raw_processor) { if (error) *error = 4; return nullptr; }
        session->processor = static_cast<Steinberg::Vst::IAudioProcessor*>(raw_processor);
        session->host = new HostApplication();
        if (!result_ok(session->component->initialize(session->host))) { if (error) *error = 5; return nullptr; }
        session->initialized = true;
        Steinberg::TUID controller_id {};
        if (result_ok(session->component->getControllerClassId(controller_id))) {
            void* raw_controller = nullptr;
            if (!result_ok(session->factory->createInstance(controller_id,
                    Steinberg::Vst::IEditController_iid, &raw_controller)) || !raw_controller) {
                if (error) *error = 11; return nullptr;
            }
            session->controller = static_cast<Steinberg::Vst::IEditController*>(raw_controller);
            if (!result_ok(session->controller->initialize(session->host))) {
                if (error) *error = 12; return nullptr;
            }
            if (!result_ok(session->controller->setComponentHandler(&session->handler))) {
                if (error) *error = 13; return nullptr;
            }
            session->component->queryInterface(Steinberg::Vst::IConnectionPoint_iid,
                reinterpret_cast<void**>(&session->component_connection));
            session->controller->queryInterface(Steinberg::Vst::IConnectionPoint_iid,
                reinterpret_cast<void**>(&session->controller_connection));
            if (session->component_connection && session->controller_connection &&
                (!result_ok(session->component_connection->connect(session->controller_connection)) ||
                 !result_ok(session->controller_connection->connect(session->component_connection)))) {
                if (error) *error = 14; return nullptr;
            }
            // Some valid plug-ins (including Surge XT 1.3.4) reject the optional
            // initial component-state mirror while accepting normal state round trips.
            // Attempt the synchronization, but do not reject an otherwise valid class.
            (void)sync_controller_component_state(session.get());
        }
        session->component->setIoMode(Steinberg::Vst::kSimple);
        Steinberg::Vst::IProcessContextRequirements* context_requirements = nullptr;
        if (result_ok(session->component->queryInterface(
                Steinberg::Vst::IProcessContextRequirements_iid,
                reinterpret_cast<void**>(&context_requirements))) && context_requirements) {
            (void)context_requirements->getProcessContextRequirements();
            context_requirements->release();
        }

        const auto audio_inputs = session->component->getBusCount(Steinberg::Vst::kAudio, Steinberg::Vst::kInput);
        const auto audio_outputs = session->component->getBusCount(Steinberg::Vst::kAudio, Steinberg::Vst::kOutput);
        const auto event_inputs = session->component->getBusCount(Steinberg::Vst::kEvent, Steinberg::Vst::kInput);
        if (audio_outputs < 1 || audio_outputs > kMaxReportedAudioBuses ||
            audio_inputs < 0 || audio_inputs > kMaxReportedAudioBuses ||
            event_inputs < 0 || event_inputs > 1) {
            if (error) *error = 61; return nullptr;
        }
        Steinberg::Vst::BusInfo output_bus {};
        if (!result_ok(session->component->getBusInfo(Steinberg::Vst::kAudio, Steinberg::Vst::kOutput, 0, output_bus)) ||
            output_bus.channelCount < 1 || output_bus.channelCount > 2) { if (error) *error = 62; return nullptr; }
        session->output_channels = static_cast<std::uint32_t>(output_bus.channelCount);
        std::uint32_t primary_input_channels = 0;
        if (audio_inputs > 0) {
            Steinberg::Vst::BusInfo input_bus {};
            if (!result_ok(session->component->getBusInfo(Steinberg::Vst::kAudio, Steinberg::Vst::kInput, 0, input_bus)) ||
                input_bus.channelCount < 1 || input_bus.channelCount > 2) { if (error) *error = 63; return nullptr; }
            primary_input_channels = static_cast<std::uint32_t>(input_bus.channelCount);
        }
        session->instrument = event_inputs > 0;
        session->input_channels = session->instrument ? 0 : primary_input_channels;
        if ((!session->instrument && session->input_channels == 0) || (session->instrument && event_inputs != 1)) {
            if (error) *error = 64; return nullptr;
        }
        Steinberg::Vst::SpeakerArrangement input_arrangement = primary_input_channels == 1
            ? Steinberg::Vst::SpeakerArr::kMono : Steinberg::Vst::SpeakerArr::kStereo;
        Steinberg::Vst::SpeakerArrangement output_arrangement = session->output_channels == 1
            ? Steinberg::Vst::SpeakerArr::kMono : Steinberg::Vst::SpeakerArr::kStereo;
        std::vector<Steinberg::Vst::SpeakerArrangement> output_arrangements(
            static_cast<std::size_t>(audio_outputs), Steinberg::Vst::SpeakerArr::kEmpty);
        output_arrangements[0] = output_arrangement;
        for (Steinberg::int32 bus = 1; bus < audio_outputs; ++bus) {
            (void)session->processor->getBusArrangement(
                Steinberg::Vst::kOutput, bus, output_arrangements[static_cast<std::size_t>(bus)]);
        }
        std::vector<Steinberg::Vst::SpeakerArrangement> input_arrangements(
            static_cast<std::size_t>(audio_inputs), Steinberg::Vst::SpeakerArr::kEmpty);
        if (audio_inputs > 0) input_arrangements[0] = input_arrangement;
        for (Steinberg::int32 bus = 1; bus < audio_inputs; ++bus) {
            (void)session->processor->getBusArrangement(
                Steinberg::Vst::kInput, bus, input_arrangements[static_cast<std::size_t>(bus)]);
        }
        if (!result_ok(session->processor->setBusArrangements(
                input_arrangements.empty() ? nullptr : input_arrangements.data(), audio_inputs,
                output_arrangements.data(), audio_outputs))) {
            if (error) *error = 65; return nullptr;
        }
        if ((!session->instrument && audio_inputs > 0 && !result_ok(session->component->activateBus(
                Steinberg::Vst::kAudio, Steinberg::Vst::kInput, 0, true))) ||
            !result_ok(session->component->activateBus(
                Steinberg::Vst::kAudio, Steinberg::Vst::kOutput, 0, true)) ||
            (session->instrument && !result_ok(session->component->activateBus(
                Steinberg::Vst::kEvent, Steinberg::Vst::kInput, 0, true)))) {
            if (error) *error = 8; return nullptr;
        }
        for (Steinberg::int32 bus = 1; bus < audio_outputs; ++bus) {
            (void)session->component->activateBus(
                Steinberg::Vst::kAudio, Steinberg::Vst::kOutput, bus, false);
        }
        for (Steinberg::int32 bus = session->instrument ? 0 : 1; bus < audio_inputs; ++bus) {
            (void)session->component->activateBus(
                Steinberg::Vst::kAudio, Steinberg::Vst::kInput, bus, false);
        }
        for (Steinberg::int32 bus = session->instrument ? 1 : 0; bus < event_inputs; ++bus) {
            (void)session->component->activateBus(
                Steinberg::Vst::kEvent, Steinberg::Vst::kInput, bus, false);
        }

        Steinberg::Vst::ProcessSetup setup {Steinberg::Vst::kRealtime, Steinberg::Vst::kSample32,
            static_cast<Steinberg::int32>(kMaxFrames), sample_rate};
        if (!result_ok(session->processor->canProcessSampleSize(Steinberg::Vst::kSample32)) ||
            !result_ok(session->processor->setupProcessing(setup))) { if (error) *error = 7; return nullptr; }
        if (!result_ok(session->component->setActive(true))) { if (error) *error = 8; return nullptr; }
        session->active = true;
        *info = SessionInfo {session->instrument ? 1u : 2u, session->input_channels,
            session->output_channels, session->instrument ? 1u : 0u,
            (std::min)(session->processor->getLatencySamples(), kMaxReportedLatencySamples),
            (std::min)(session->processor->getTailSamples(), kMaxReportedTailSamples),
            kStateLimit, static_cast<std::uint32_t>(sizeof(SharedSessionMemory))};
        if (error) *error = 0;
        return session.release();
    } catch (...) { if (error) *error = 10; return nullptr; }
}

extern "C" int pocket_daw_vst3_session_set_processing(void* raw_session, bool enabled) noexcept {
    auto* session = static_cast<Session*>(raw_session);
    if (!session || !session->processor || !session->active) return 1;
    try {
        if (!result_ok(session->processor->setProcessing(enabled))) return 2;
        session->processing = enabled;
        return 0;
    } catch (...) { return 3; }
}

extern "C" int pocket_daw_vst3_session_process(void* raw_session, void* raw_shared,
    std::size_t shared_bytes, std::uint32_t deadline_micros) noexcept {
    auto* session = static_cast<Session*>(raw_session);
    auto* shared = static_cast<SharedSessionMemory*>(raw_shared);
    if (shared && shared_bytes >= offsetof(SharedSessionMemory, output) + sizeof(shared->output)) clear_output(shared);
    if (!session || !shared || shared_bytes != sizeof(SharedSessionMemory) ||
        shared->magic != kSharedMagic || shared->version != kSharedVersion ||
        shared->total_bytes != sizeof(SharedSessionMemory) || shared->max_frames != kMaxFrames ||
        shared->frame_count > kMaxFrames || shared->event_count > kMaxEvents ||
        shared->parameter_count > kMaxParameters || shared->input_channels != session->input_channels ||
        shared->output_channels != session->output_channels) {
        if (shared && shared_bytes >= offsetof(SharedSessionMemory, process_status) + sizeof(shared->process_status))
            shared->process_status = kProcessInvalid;
        return kProcessInvalid;
    }
    try {
        const auto frames = shared->frame_count;
        for (std::uint32_t channel = 0; channel < 2; ++channel) {
            std::copy_n(shared->input[channel], frames, session->input[channel].begin());
            std::fill_n(session->output[channel].begin(), frames, 0.0f);
        }
        session->events.reset();
        for (std::uint32_t index = 0; index < shared->event_count; ++index) {
            const auto& source = shared->events[index];
            if (source.sample_offset >= frames || source.channel < 0 || source.channel > 15 ||
                source.pitch < 0 || source.pitch > 127 || source.kind > 1) {
                shared->process_status = kProcessInvalid; return kProcessInvalid;
            }
            Steinberg::Vst::Event event {};
            event.busIndex = 0; event.sampleOffset = static_cast<Steinberg::int32>(source.sample_offset);
            event.ppqPosition = shared->project_ppq +
                (static_cast<double>(source.sample_offset) / shared->sample_rate) *
                (shared->tempo / 60.0);
            event.flags = 0;
            if (source.kind == 0) {
                event.type = Steinberg::Vst::Event::kNoteOnEvent;
                event.noteOn = {source.channel, source.pitch, source.tuning, source.value, 0, source.note_id};
            } else {
                event.type = Steinberg::Vst::Event::kNoteOffEvent;
                event.noteOff = {source.channel, source.pitch, source.value, source.note_id, source.tuning};
            }
            if (!session->events.append(event)) { shared->process_status = kProcessInvalid; return kProcessInvalid; }
        }
        session->parameters.reset();
        for (std::uint32_t index = 0; index < shared->parameter_count; ++index) {
            const auto& source = shared->parameters[index];
            if (source.sample_offset >= frames || source.value < 0.0 || source.value > 1.0 ||
                !session->parameters.append(source.parameter_id, source.sample_offset, source.value)) {
                shared->process_status = kProcessInvalid; return kProcessInvalid;
            }
        }
        ParameterEdit editor_edit {};
        while (session->handler.pop_audio(editor_edit)) {
            if (!session->parameters.append(editor_edit.parameter_id, 0, editor_edit.value)) {
                shared->process_status = kProcessInvalid; return kProcessInvalid;
            }
        }
        float* input_channels[2] = {session->input[0].data(), session->input[1].data()};
        float* output_channels[2] = {session->output[0].data(), session->output[1].data()};
        Steinberg::Vst::AudioBusBuffers input_bus {};
        input_bus.numChannels = static_cast<Steinberg::int32>(session->input_channels);
        input_bus.channelBuffers32 = input_channels;
        Steinberg::Vst::AudioBusBuffers output_bus {};
        output_bus.numChannels = static_cast<Steinberg::int32>(session->output_channels);
        output_bus.channelBuffers32 = output_channels;
        Steinberg::Vst::ProcessContext context {};
        context.state = Steinberg::Vst::ProcessContext::kProjectTimeMusicValid |
            Steinberg::Vst::ProcessContext::kBarPositionValid |
            Steinberg::Vst::ProcessContext::kTempoValid |
            Steinberg::Vst::ProcessContext::kTimeSigValid |
            Steinberg::Vst::ProcessContext::kContTimeValid;
        if (shared->transport_flags & 1) context.state |= Steinberg::Vst::ProcessContext::kPlaying;
        if (shared->transport_flags & 2) context.state |= Steinberg::Vst::ProcessContext::kRecording;
        if (shared->transport_flags & 4) context.state |= Steinberg::Vst::ProcessContext::kCycleActive |
            Steinberg::Vst::ProcessContext::kCycleValid;
        context.sampleRate = shared->sample_rate;
        context.projectTimeSamples = shared->project_time_samples;
        context.continousTimeSamples = shared->continuous_time_samples;
        context.projectTimeMusic = shared->project_ppq;
        context.barPositionMusic = shared->bar_position_ppq;
        context.cycleStartMusic = shared->loop_start_ppq;
        context.cycleEndMusic = shared->loop_end_ppq;
        context.tempo = shared->tempo;
        context.timeSigNumerator = shared->time_signature_numerator;
        context.timeSigDenominator = shared->time_signature_denominator;
        Steinberg::Vst::ProcessData data {};
        data.processMode = Steinberg::Vst::kRealtime; data.symbolicSampleSize = Steinberg::Vst::kSample32;
        data.numSamples = static_cast<Steinberg::int32>(frames);
        data.numInputs = session->input_channels ? 1 : 0; data.inputs = session->input_channels ? &input_bus : nullptr;
        data.numOutputs = 1; data.outputs = &output_bus;
        data.inputParameterChanges = &session->parameters;
        data.inputEvents = session->instrument ? &session->events : nullptr;
        data.processContext = &context;
        const auto start = std::chrono::steady_clock::now();
        const auto result = session->processor->process(data);
        const auto elapsed = std::chrono::duration_cast<std::chrono::microseconds>(
            std::chrono::steady_clock::now() - start).count();
        shared->elapsed_micros = static_cast<std::uint64_t>((std::max)(elapsed, std::int64_t {0}));
        if (!result_ok(result)) { shared->process_status = kProcessPluginFailure; return kProcessPluginFailure; }
        if (deadline_micros == 0 || shared->elapsed_micros > deadline_micros) {
            shared->process_status = kProcessDeadlineMiss; return kProcessDeadlineMiss;
        }
        for (std::uint32_t channel = 0; channel < session->output_channels; ++channel)
            std::copy_n(session->output[channel].begin(), frames, shared->output[channel]);
        shared->process_status = kProcessOk;
        return kProcessOk;
    } catch (...) { shared->process_status = kProcessPluginFailure; return kProcessPluginFailure; }
}

extern "C" int pocket_daw_vst3_session_get_state(void* raw_session, void* raw_shared,
    std::size_t shared_bytes) noexcept {
    auto* session = static_cast<Session*>(raw_session);
    auto* shared = static_cast<SharedSessionMemory*>(raw_shared);
    if (!session || !shared || shared_bytes != sizeof(SharedSessionMemory)) return 1;
    try {
        MemoryStream component_stream;
        MemoryStream controller_stream;
        if (!result_ok(session->component->getState(&component_stream))) return 2;
        const bool controller_state_valid = session->controller &&
            result_ok(session->controller->getState(&controller_stream));
        constexpr std::uint32_t envelope_magic = 0x50445354; // PDST
        const std::size_t footer_size = sizeof(std::uint32_t) * 3;
        const auto controller_size = controller_state_valid ? controller_stream.bytes().size() : 0;
        const auto total = component_stream.bytes().size() + controller_size + footer_size;
        if (total > kStateLimit) return 2;
        auto* cursor = shared->state;
        if (!component_stream.bytes().empty()) {
            std::memcpy(cursor, component_stream.bytes().data(), component_stream.bytes().size());
            cursor += component_stream.bytes().size();
        }
        if (controller_size) {
            std::memcpy(cursor, controller_stream.bytes().data(), controller_size);
            cursor += controller_size;
        }
        const std::uint32_t footer[3] = {envelope_magic,
            static_cast<std::uint32_t>(component_stream.bytes().size()),
            static_cast<std::uint32_t>(controller_size)};
        std::memcpy(cursor, footer, sizeof(footer));
        shared->state_size = static_cast<std::uint32_t>(total);
        return 0;
    } catch (...) { return 3; }
}

extern "C" int pocket_daw_vst3_session_set_state(void* raw_session, void* raw_shared,
    std::size_t shared_bytes) noexcept {
    auto* session = static_cast<Session*>(raw_session);
    auto* shared = static_cast<SharedSessionMemory*>(raw_shared);
    if (!session || !shared || shared_bytes != sizeof(SharedSessionMemory) || shared->state_size > kStateLimit) return 1;
    try {
        constexpr std::uint32_t envelope_magic = 0x50445354;
        const std::size_t footer_size = sizeof(std::uint32_t) * 3;
        std::size_t component_size = shared->state_size;
        std::size_t controller_size = 0;
        if (shared->state_size >= footer_size) {
            std::uint32_t footer[3] {};
            std::memcpy(footer, shared->state + shared->state_size - footer_size, footer_size);
            if (footer[0] == envelope_magic &&
                static_cast<std::uint64_t>(footer[1]) + footer[2] + footer_size == shared->state_size) {
                component_size = footer[1]; controller_size = footer[2];
            }
        }
        MemoryStream component_stream(std::vector<std::uint8_t>(shared->state,
            shared->state + component_size));
        if (!result_ok(session->component->setState(&component_stream))) return 2;
        if (session->controller) {
            MemoryStream sync_stream(std::vector<std::uint8_t>(shared->state,
                shared->state + component_size));
            (void)session->controller->setComponentState(&sync_stream);
            if (controller_size) {
                MemoryStream controller_stream(std::vector<std::uint8_t>(
                    shared->state + component_size,
                    shared->state + component_size + controller_size));
                if (!result_ok(session->controller->setState(&controller_stream))) return 2;
            }
        }
        return 0;
    } catch (...) { return 3; }
}

extern "C" void pocket_daw_vst3_session_destroy(void* raw_session) noexcept {
    try { delete static_cast<Session*>(raw_session); } catch (...) {}
}

extern "C" int pocket_daw_vst3_session_query_parameters(void* raw_session,
    ParameterDescriptor* output, std::size_t capacity, std::size_t* output_count) noexcept {
    auto* session = static_cast<Session*>(raw_session);
    if (!session || !output_count) return 1;
    *output_count = 0;
    if (!session->controller) return 0;
    try {
        const auto count = session->controller->getParameterCount();
        if (count < 0 || static_cast<std::size_t>(count) > capacity) return 2;
        for (Steinberg::int32 index = 0; index < count; ++index) {
            Steinberg::Vst::ParameterInfo info {};
            if (!result_ok(session->controller->getParameterInfo(index, info))) return 3;
            auto& target = output[index]; std::memset(&target, 0, sizeof(target));
            target.parameter_id = info.id;
            copy_utf16(target.title, sizeof(target.title), info.title, 128);
            copy_utf16(target.short_title, sizeof(target.short_title), info.shortTitle, 128);
            copy_utf16(target.units, sizeof(target.units), info.units, 128);
            target.step_count = info.stepCount; target.default_normalized = info.defaultNormalizedValue;
            target.current_normalized = session->controller->getParamNormalized(info.id);
            target.flags = static_cast<std::uint32_t>(info.flags);
            ++(*output_count);
        }
        return 0;
    } catch (...) { return 4; }
}

extern "C" int pocket_daw_vst3_session_set_parameter(void* raw_session,
    std::uint32_t parameter_id, double value) noexcept {
    auto* session = static_cast<Session*>(raw_session);
    if (!session || !session->controller || value < 0.0 || value > 1.0) return 1;
    try {
        if (!result_ok(session->controller->setParamNormalized(parameter_id, value))) return 2;
        return result_ok(session->handler.performEdit(parameter_id, value)) ? 0 : 2;
    }
    catch (...) { return 3; }
}

extern "C" int pocket_daw_vst3_session_poll_edits(void* raw_session,
    ParameterEdit* output, std::size_t capacity, std::size_t* output_count,
    std::uint32_t* restart_flags) noexcept {
    auto* session = static_cast<Session*>(raw_session);
    if (!session || !output || !output_count || !restart_flags) return 1;
    *output_count = 0; *restart_flags = session->handler.take_restart_flags();
    ParameterEdit edit {};
    while (*output_count < capacity && session->handler.pop_control(edit))
        output[(*output_count)++] = edit;
    return 0;
}

extern "C" int pocket_daw_vst3_session_query_programs(void* raw_session,
    ProgramDescriptor* output, std::size_t capacity, std::size_t* output_count) noexcept {
    auto* session = static_cast<Session*>(raw_session);
    if (!session || !session->controller || !output || !output_count) return 1;
    *output_count = 0;
    Steinberg::Vst::IUnitInfo* units = nullptr;
    if (!result_ok(session->controller->queryInterface(Steinberg::Vst::IUnitInfo_iid,
            reinterpret_cast<void**>(&units))) || !units) return 0;
    try {
        const auto list_count = units->getProgramListCount();
        if (list_count < 0 || list_count > kMaxReportedProgramLists) {
            units->release(); return 2;
        }
        for (Steinberg::int32 list_index = 0; list_index < list_count; ++list_index) {
            Steinberg::Vst::ProgramListInfo list {};
            if (!result_ok(units->getProgramListInfo(list_index, list)) || list.programCount < 0 ||
                list.programCount > kMaxReportedPrograms) {
                units->release(); return 2;
            }
            for (Steinberg::int32 program_index = 0; program_index < list.programCount; ++program_index) {
                if (*output_count >= capacity) { units->release(); return 3; }
                Steinberg::Vst::String128 name {};
                if (!result_ok(units->getProgramName(list.id, program_index, name))) continue;
                auto& target = output[*output_count]; std::memset(&target, 0, sizeof(target));
                target.list_id = list.id; target.program_index = program_index;
                copy_utf16(target.list_name, sizeof(target.list_name), list.name, 128);
                copy_utf16(target.program_name, sizeof(target.program_name), name, 128);
                ++(*output_count);
            }
        }
        units->release(); return 0;
    } catch (...) { units->release(); return 4; }
}

extern "C" int pocket_daw_vst3_session_select_program(void* raw_session,
    std::int32_t list_id, std::int32_t program_index) noexcept {
    auto* session = static_cast<Session*>(raw_session);
    if (!session || !session->controller || program_index < 0) return 1;
    Steinberg::Vst::IUnitInfo* units = nullptr;
    if (!result_ok(session->controller->queryInterface(Steinberg::Vst::IUnitInfo_iid,
            reinterpret_cast<void**>(&units))) || !units) return 2;
    try {
        Steinberg::int32 program_count = 0;
        const auto list_count = units->getProgramListCount();
        if (list_count < 0 || list_count > kMaxReportedProgramLists) {
            units->release(); return 3;
        }
        for (Steinberg::int32 index = 0; index < list_count; ++index) {
            Steinberg::Vst::ProgramListInfo info {};
            if (result_ok(units->getProgramListInfo(index, info)) && info.id == list_id)
                program_count = info.programCount;
        }
        units->release();
        if (program_count <= 0 || program_count > kMaxReportedPrograms || program_index >= program_count) return 3;
        const auto parameter_count = session->controller->getParameterCount();
        if (parameter_count < 0 || parameter_count > kMaxReportedControllerParameters) return 4;
        for (Steinberg::int32 index = 0; index < parameter_count; ++index) {
            Steinberg::Vst::ParameterInfo info {};
            if (result_ok(session->controller->getParameterInfo(index, info)) &&
                (info.flags & Steinberg::Vst::ParameterInfo::kIsProgramChange)) {
                const double normalized = program_count == 1 ? 0.0
                    : static_cast<double>(program_index) / static_cast<double>(program_count - 1);
                if (!result_ok(session->controller->setParamNormalized(info.id, normalized)) ||
                    !result_ok(session->handler.performEdit(info.id, normalized))) return 4;
                return 0;
            }
        }
        return 5;
    } catch (...) { units->release(); return 6; }
}

extern "C" int pocket_daw_vst3_session_open_editor(void* raw_session,
    const wchar_t* title, std::uint64_t owner_window_handle,
    std::uint64_t* window_handle) noexcept {
    auto* session = static_cast<Session*>(raw_session);
    if (window_handle) *window_handle = 0;
    const auto owner_window = reinterpret_cast<HWND>(owner_window_handle);
    if (!session || !session->controller || !title || !IsWindow(owner_window) || !ensure_editor_class()) return 1;
    DWORD owner_process = 0; GetWindowThreadProcessId(owner_window, &owner_process);
    DWORD owner_session = 0; DWORD host_session = 0;
    if (!owner_process || !ProcessIdToSessionId(owner_process, &owner_session) ||
        !ProcessIdToSessionId(GetCurrentProcessId(), &host_session) || owner_session != host_session) return 1;
    try {
        if (session->editor_window) {
            ShowWindow(session->editor_window, SW_SHOW); SetForegroundWindow(session->editor_window);
            if (window_handle) *window_handle = reinterpret_cast<std::uint64_t>(session->editor_window);
            return 0;
        }
        session->view = session->controller->createView(Steinberg::Vst::ViewType::kEditor);
        if (!session->view || !result_ok(session->view->isPlatformTypeSupported(Steinberg::kPlatformTypeHWND))) {
            close_editor(session); return 2;
        }
        Steinberg::ViewRect rect {};
        if (!result_ok(session->view->getSize(&rect)) || rect.getWidth() <= 0 || rect.getHeight() <= 0) {
            close_editor(session); return 3;
        }
        session->frame = new PlugFrame(session);
        if (!result_ok(session->view->setFrame(session->frame))) { close_editor(session); return 3; }
        RECT window_rect {0,0,rect.getWidth(),rect.getHeight()};
        AdjustWindowRectEx(&window_rect, WS_OVERLAPPEDWINDOW, FALSE, 0);
        const auto old_context = SetThreadDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2);
        session->editor_window = CreateWindowExW(0, L"PocketDawVst3EditorWindow", title,
            WS_OVERLAPPEDWINDOW, CW_USEDEFAULT, CW_USEDEFAULT,
            window_rect.right-window_rect.left, window_rect.bottom-window_rect.top,
            owner_window, nullptr, GetModuleHandleW(nullptr), session);
        if (old_context) SetThreadDpiAwarenessContext(old_context);
        if (!session->editor_window) { close_editor(session); return 4; }
        update_editor_scale(session);
        if (!result_ok(session->view->attached(session->editor_window, Steinberg::kPlatformTypeHWND))) {
            close_editor(session); return 5;
        }
        session->view->onSize(&rect);
        ShowWindow(session->editor_window, SW_SHOW); UpdateWindow(session->editor_window);
        session->view->onFocus(true);
        if (window_handle) *window_handle = reinterpret_cast<std::uint64_t>(session->editor_window);
        return 0;
    } catch (...) { close_editor(session); return 6; }
}

extern "C" int pocket_daw_vst3_session_close_editor(void* raw_session) noexcept {
    auto* session = static_cast<Session*>(raw_session);
    if (!session) return 1;
    try { close_editor(session); return 0; } catch (...) { return 2; }
}

extern "C" int pocket_daw_vst3_session_pump_editor(void* raw_session) noexcept {
    auto* session = static_cast<Session*>(raw_session);
    if (!session) return 1;
    MSG message {};
    while (PeekMessageW(&message, nullptr, 0, 0, PM_REMOVE)) {
        TranslateMessage(&message); DispatchMessageW(&message);
    }
    return 0;
}

extern "C" bool pocket_daw_vst3_session_editor_available(void* raw_session) noexcept {
    auto* session = static_cast<Session*>(raw_session);
    if (!session || !session->controller) return false;
    try {
        auto* view = session->controller->createView(Steinberg::Vst::ViewType::kEditor);
        if (!view) return false;
        const bool supported = result_ok(view->isPlatformTypeSupported(Steinberg::kPlatformTypeHWND));
        view->release(); return supported;
    } catch (...) { return false; }
}

extern "C" bool pocket_daw_vst3_session_editor_open(void* raw_session) noexcept {
    auto* session = static_cast<Session*>(raw_session);
    if (!session || !session->view || !session->editor_window) return false;
    return IsWindow(session->editor_window) && IsWindowVisible(session->editor_window);
}
