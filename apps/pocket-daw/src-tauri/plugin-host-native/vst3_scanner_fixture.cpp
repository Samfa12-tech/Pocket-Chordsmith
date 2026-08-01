#include "pluginterfaces/base/ibstream.h"
#include "pluginterfaces/base/ipluginbase.h"
#include "pluginterfaces/gui/iplugview.h"
#include "pluginterfaces/gui/iplugviewcontentscalesupport.h"
#include "pluginterfaces/vst/ivstaudioprocessor.h"
#include "pluginterfaces/vst/ivstcomponent.h"
#include "pluginterfaces/vst/ivsteditcontroller.h"
#include "pluginterfaces/vst/ivstmessage.h"
#include "pluginterfaces/vst/ivstevents.h"
#include "pluginterfaces/vst/ivstparameterchanges.h"
#include "pluginterfaces/vst/ivstprocesscontext.h"
#include "pluginterfaces/vst/ivstunits.h"
#include "pluginterfaces/vst/vstspeaker.h"

#include <windows.h>

#include <algorithm>
#include <array>
#include <atomic>
#include <cmath>
#include <cstring>

namespace {

const Steinberg::TUID kInstrumentId = INLINE_UID(0x50444157, 0x5343414E, 0x46495854, 0x55524531);
const Steinberg::TUID kEffectId = INLINE_UID(0x50444157, 0x5343414E, 0x46495854, 0x55524533);
const Steinberg::TUID kControllerId = INLINE_UID(0x50444157, 0x5343414E, 0x46495854, 0x55524532);
constexpr Steinberg::Vst::ParamID kGainParameter = 100;

bool iid_equal(const Steinberg::TUID left, const Steinberg::TUID right) {
    return std::memcmp(left, right, sizeof(Steinberg::TUID)) == 0;
}

void set_name(Steinberg::Vst::String128 output, const wchar_t* name) {
    std::wcsncpy(reinterpret_cast<wchar_t*>(output), name, 127);
    output[127] = 0;
}

struct FixtureState {
    std::uint32_t magic {0x50444658};
    double gain {0.5};
    double tempo {0.0};
    double project_ppq {0.0};
    double loop_start {0.0};
    double loop_end {0.0};
    std::int64_t project_samples {0};
    std::uint32_t context_flags {0};
    std::int32_t numerator {0};
    std::int32_t denominator {0};
    double last_event_ppq {0.0};
};

class FixtureView final : public Steinberg::IPlugView,
                          public Steinberg::IPlugViewContentScaleSupport {
public:
    explicit FixtureView(Steinberg::Vst::IComponentHandler* handler) : handler_(handler) {}
    Steinberg::tresult PLUGIN_API queryInterface(const Steinberg::TUID iid, void** object) override {
        if (!object) return Steinberg::kInvalidArgument;
        *object = nullptr;
        if (iid_equal(iid, Steinberg::FUnknown_iid) || iid_equal(iid, Steinberg::IPlugView_iid))
            *object = static_cast<Steinberg::IPlugView*>(this);
        else if (iid_equal(iid, Steinberg::IPlugViewContentScaleSupport_iid))
            *object = static_cast<Steinberg::IPlugViewContentScaleSupport*>(this);
        else return Steinberg::kNoInterface;
        addRef(); return Steinberg::kResultOk;
    }
    Steinberg::uint32 PLUGIN_API addRef() override { return ++references_; }
    Steinberg::uint32 PLUGIN_API release() override {
        const auto next = --references_; if (next == 0) delete this; return next;
    }
    Steinberg::tresult PLUGIN_API isPlatformTypeSupported(Steinberg::FIDString type) override {
        return type && std::strcmp(type, Steinberg::kPlatformTypeHWND) == 0
            ? Steinberg::kResultTrue : Steinberg::kResultFalse;
    }
    Steinberg::tresult PLUGIN_API attached(void* parent, Steinberg::FIDString type) override {
        if (!parent || !result(type)) return Steinberg::kInvalidArgument;
        parent_ = static_cast<HWND>(parent);
        child_ = CreateWindowExW(0, L"STATIC", L"Pocket DAW VST3 Fixture Editor",
            WS_CHILD | WS_VISIBLE | SS_CENTER, 0, 0, rect_.getWidth(), rect_.getHeight(),
            parent_, nullptr, GetModuleHandleW(nullptr), nullptr);
        return child_ ? Steinberg::kResultOk : Steinberg::kResultFalse;
    }
    Steinberg::tresult PLUGIN_API removed() override {
        if (child_) DestroyWindow(child_); child_ = nullptr; parent_ = nullptr; return Steinberg::kResultOk;
    }
    Steinberg::tresult PLUGIN_API onWheel(float) override { return Steinberg::kResultFalse; }
    Steinberg::tresult PLUGIN_API onKeyDown(Steinberg::char16, Steinberg::int16, Steinberg::int16) override { return Steinberg::kResultFalse; }
    Steinberg::tresult PLUGIN_API onKeyUp(Steinberg::char16, Steinberg::int16, Steinberg::int16) override { return Steinberg::kResultFalse; }
    Steinberg::tresult PLUGIN_API getSize(Steinberg::ViewRect* rect) override {
        if (!rect) return Steinberg::kInvalidArgument; *rect = rect_; return Steinberg::kResultOk;
    }
    Steinberg::tresult PLUGIN_API onSize(Steinberg::ViewRect* rect) override {
        if (!rect || rect->getWidth() < 120 || rect->getHeight() < 80) return Steinberg::kInvalidArgument;
        rect_ = *rect; if (child_) MoveWindow(child_, 0, 0, rect_.getWidth(), rect_.getHeight(), TRUE);
        return Steinberg::kResultOk;
    }
    Steinberg::tresult PLUGIN_API onFocus(Steinberg::TBool state) override {
        if (state && child_) SetFocus(child_);
        if (state && handler_ && !sent_edit_) {
            handler_->beginEdit(kGainParameter); handler_->performEdit(kGainParameter,0.625);
            handler_->endEdit(kGainParameter); sent_edit_=true;
        }
        return Steinberg::kResultOk;
    }
    Steinberg::tresult PLUGIN_API setFrame(Steinberg::IPlugFrame* frame) override { frame_ = frame; return Steinberg::kResultOk; }
    Steinberg::tresult PLUGIN_API canResize() override { return Steinberg::kResultTrue; }
    Steinberg::tresult PLUGIN_API checkSizeConstraint(Steinberg::ViewRect* rect) override {
        if (!rect) return Steinberg::kInvalidArgument;
        rect->right = rect->left + (std::max)(120, rect->getWidth());
        rect->bottom = rect->top + (std::max)(80, rect->getHeight()); return Steinberg::kResultOk;
    }
    Steinberg::tresult PLUGIN_API setContentScaleFactor(Steinberg::IPlugViewContentScaleSupport::ScaleFactor factor) override {
        if (factor <= 0.0f) return Steinberg::kInvalidArgument; scale_ = factor; return Steinberg::kResultTrue;
    }
private:
    bool result(Steinberg::FIDString type) { return isPlatformTypeSupported(type) == Steinberg::kResultTrue; }
    std::atomic<Steinberg::uint32> references_ {1};
    HWND parent_ {nullptr}; HWND child_ {nullptr}; Steinberg::IPlugFrame* frame_ {nullptr};
    Steinberg::ViewRect rect_ {0, 0, 420, 240}; float scale_ {1.0f};
    Steinberg::Vst::IComponentHandler* handler_ {nullptr}; bool sent_edit_ {false};
};

class FixtureController final : public Steinberg::Vst::IEditController,
                                public Steinberg::Vst::IUnitInfo,
                                public Steinberg::Vst::IConnectionPoint {
public:
    Steinberg::tresult PLUGIN_API queryInterface(const Steinberg::TUID iid, void** object) override {
        if (!object) return Steinberg::kInvalidArgument; *object = nullptr;
        if (iid_equal(iid, Steinberg::FUnknown_iid) || iid_equal(iid, Steinberg::IPluginBase_iid) ||
            iid_equal(iid, Steinberg::Vst::IEditController_iid)) {
            *object = static_cast<Steinberg::Vst::IEditController*>(this); addRef(); return Steinberg::kResultOk;
        }
        if (iid_equal(iid, Steinberg::Vst::IUnitInfo_iid)) {
            *object = static_cast<Steinberg::Vst::IUnitInfo*>(this); addRef(); return Steinberg::kResultOk;
        }
        if (iid_equal(iid, Steinberg::Vst::IConnectionPoint_iid)) {
            *object = static_cast<Steinberg::Vst::IConnectionPoint*>(this); addRef(); return Steinberg::kResultOk;
        }
        return Steinberg::kNoInterface;
    }
    Steinberg::uint32 PLUGIN_API addRef() override { return ++references_; }
    Steinberg::uint32 PLUGIN_API release() override { const auto next=--references_; if(!next)delete this; return next; }
    Steinberg::tresult PLUGIN_API initialize(Steinberg::FUnknown*) override { return Steinberg::kResultOk; }
    Steinberg::tresult PLUGIN_API terminate() override { return Steinberg::kResultOk; }
    Steinberg::tresult PLUGIN_API setComponentState(Steinberg::IBStream* stream) override {
        FixtureState state {}; Steinberg::int32 read=0;
        if (!stream || stream->read(&state,sizeof(state),&read)!=Steinberg::kResultOk || read!=sizeof(state) || state.magic!=0x50444658)
            return Steinberg::kResultFalse; gain_=state.gain; return Steinberg::kResultOk;
    }
    Steinberg::tresult PLUGIN_API setState(Steinberg::IBStream* stream) override {
        Steinberg::int32 read=0; double value=0;
        if (!stream || stream->read(&value,sizeof(value),&read)!=Steinberg::kResultOk || read!=sizeof(value)) return Steinberg::kResultFalse;
        gain_=value; return Steinberg::kResultOk;
    }
    Steinberg::tresult PLUGIN_API getState(Steinberg::IBStream* stream) override {
        Steinberg::int32 written=0; return stream && stream->write(&gain_,sizeof(gain_),&written)==Steinberg::kResultOk && written==sizeof(gain_)
            ? Steinberg::kResultOk : Steinberg::kResultFalse;
    }
    Steinberg::int32 PLUGIN_API getParameterCount() override { return 2; }
    Steinberg::tresult PLUGIN_API getParameterInfo(Steinberg::int32 index, Steinberg::Vst::ParameterInfo& info) override {
        if (index<0 || index>1) return Steinberg::kInvalidArgument; info={};
        if (index == 1) {
            info.id=101; set_name(info.title,L"Program"); set_name(info.shortTitle,L"Program");
            info.stepCount=1; info.defaultNormalizedValue=0.0; info.unitId=0;
            info.flags=Steinberg::Vst::ParameterInfo::kIsProgramChange; return Steinberg::kResultOk;
        }
        info.id=kGainParameter;
        set_name(info.title,L"Gain"); set_name(info.shortTitle,L"Gain"); info.stepCount=0;
        info.defaultNormalizedValue=0.5; info.unitId=0;
        info.flags=Steinberg::Vst::ParameterInfo::kCanAutomate; return Steinberg::kResultOk;
    }
    Steinberg::tresult PLUGIN_API getParamStringByValue(Steinberg::Vst::ParamID id, Steinberg::Vst::ParamValue value,
                                                        Steinberg::Vst::String128 output) override {
        if(id==101) { set_name(output,value<0.5?L"Soft":L"Loud"); return Steinberg::kResultOk; }
        if(id!=kGainParameter)return Steinberg::kInvalidArgument; swprintf(reinterpret_cast<wchar_t*>(output),128,L"%.3f",value); return Steinberg::kResultOk;
    }
    Steinberg::tresult PLUGIN_API getParamValueByString(Steinberg::Vst::ParamID id, Steinberg::Vst::TChar* input,
                                                        Steinberg::Vst::ParamValue& value) override {
        if(!input)return Steinberg::kInvalidArgument;
        if(id==101) { value=wcscmp(reinterpret_cast<wchar_t*>(input),L"Loud")==0?1.0:0.0; return Steinberg::kResultOk; }
        if(id!=kGainParameter)return Steinberg::kInvalidArgument; value=wcstod(reinterpret_cast<wchar_t*>(input),nullptr); return Steinberg::kResultOk;
    }
    Steinberg::Vst::ParamValue PLUGIN_API normalizedParamToPlain(Steinberg::Vst::ParamID, Steinberg::Vst::ParamValue value) override { return value; }
    Steinberg::Vst::ParamValue PLUGIN_API plainParamToNormalized(Steinberg::Vst::ParamID, Steinberg::Vst::ParamValue value) override { return value; }
    Steinberg::Vst::ParamValue PLUGIN_API getParamNormalized(Steinberg::Vst::ParamID id) override { return id==kGainParameter?gain_:(id==101?program_:0); }
    Steinberg::tresult PLUGIN_API setParamNormalized(Steinberg::Vst::ParamID id, Steinberg::Vst::ParamValue value) override {
        if(id==101) { program_=value<0.5?0.0:1.0; return Steinberg::kResultOk; }
        if(id!=kGainParameter)return Steinberg::kInvalidArgument; gain_=(std::max)(0.0,(std::min)(1.0,value)); return Steinberg::kResultOk;
    }
    Steinberg::tresult PLUGIN_API setComponentHandler(Steinberg::Vst::IComponentHandler* handler) override { handler_=handler; return Steinberg::kResultOk; }
    Steinberg::IPlugView* PLUGIN_API createView(Steinberg::FIDString name) override {
        return name && std::strcmp(name,Steinberg::Vst::ViewType::kEditor)==0 ? new FixtureView(handler_) : nullptr;
    }
    Steinberg::int32 PLUGIN_API getUnitCount() override { return 1; }
    Steinberg::tresult PLUGIN_API getUnitInfo(Steinberg::int32 index, Steinberg::Vst::UnitInfo& info) override {
        if(index!=0)return Steinberg::kInvalidArgument; info={}; info.id=0; info.parentUnitId=-1;
        set_name(info.name,L"Root"); info.programListId=1; return Steinberg::kResultOk;
    }
    Steinberg::int32 PLUGIN_API getProgramListCount() override { return 1; }
    Steinberg::tresult PLUGIN_API getProgramListInfo(Steinberg::int32 index, Steinberg::Vst::ProgramListInfo& info) override {
        if(index!=0)return Steinberg::kInvalidArgument; info={}; info.id=1; set_name(info.name,L"Factory");
        info.programCount=2; return Steinberg::kResultOk;
    }
    Steinberg::tresult PLUGIN_API getProgramName(Steinberg::Vst::ProgramListID list, Steinberg::int32 index,
                                                 Steinberg::Vst::String128 name) override {
        if(list!=1||index<0||index>1)return Steinberg::kInvalidArgument; set_name(name,index==0?L"Soft":L"Loud"); return Steinberg::kResultOk;
    }
    Steinberg::tresult PLUGIN_API getProgramInfo(Steinberg::Vst::ProgramListID, Steinberg::int32,
                                                 Steinberg::Vst::CString, Steinberg::Vst::String128) override { return Steinberg::kResultFalse; }
    Steinberg::tresult PLUGIN_API hasProgramPitchNames(Steinberg::Vst::ProgramListID, Steinberg::int32) override { return Steinberg::kResultFalse; }
    Steinberg::tresult PLUGIN_API getProgramPitchName(Steinberg::Vst::ProgramListID, Steinberg::int32,
                                                      Steinberg::int16, Steinberg::Vst::String128) override { return Steinberg::kResultFalse; }
    Steinberg::Vst::UnitID PLUGIN_API getSelectedUnit() override { return 0; }
    Steinberg::tresult PLUGIN_API selectUnit(Steinberg::Vst::UnitID id) override { return id==0?Steinberg::kResultOk:Steinberg::kInvalidArgument; }
    Steinberg::tresult PLUGIN_API getUnitByBus(Steinberg::Vst::MediaType, Steinberg::Vst::BusDirection,
                                               Steinberg::int32, Steinberg::int32, Steinberg::Vst::UnitID& id) override { id=0; return Steinberg::kResultOk; }
    Steinberg::tresult PLUGIN_API setUnitProgramData(Steinberg::int32, Steinberg::int32, Steinberg::IBStream*) override { return Steinberg::kNotImplemented; }
    Steinberg::tresult PLUGIN_API connect(Steinberg::Vst::IConnectionPoint* other) override {
        if(!other)return Steinberg::kInvalidArgument; connected_=true; return Steinberg::kResultOk;
    }
    Steinberg::tresult PLUGIN_API disconnect(Steinberg::Vst::IConnectionPoint*) override { connected_=false; return Steinberg::kResultOk; }
    Steinberg::tresult PLUGIN_API notify(Steinberg::Vst::IMessage*) override { return Steinberg::kResultOk; }
private:
    std::atomic<Steinberg::uint32> references_{1}; double gain_{0.5}; double program_{0.0};
    bool connected_{false}; Steinberg::Vst::IComponentHandler* handler_{nullptr};
};

class FixtureProcessor final : public Steinberg::Vst::IComponent,
                               public Steinberg::Vst::IAudioProcessor,
                               public Steinberg::Vst::IConnectionPoint {
public:
    explicit FixtureProcessor(bool instrument) : instrument_(instrument) {}

    Steinberg::tresult PLUGIN_API queryInterface(const Steinberg::TUID iid, void** object) override {
        if (!object) return Steinberg::kInvalidArgument;
        *object = nullptr;
        if (iid_equal(iid, Steinberg::FUnknown_iid) || iid_equal(iid, Steinberg::IPluginBase_iid) ||
            iid_equal(iid, Steinberg::Vst::IComponent_iid)) {
            *object = static_cast<Steinberg::Vst::IComponent*>(this);
        } else if (iid_equal(iid, Steinberg::Vst::IAudioProcessor_iid)) {
            *object = static_cast<Steinberg::Vst::IAudioProcessor*>(this);
        } else if (iid_equal(iid, Steinberg::Vst::IConnectionPoint_iid)) {
            *object = static_cast<Steinberg::Vst::IConnectionPoint*>(this);
        } else {
            return Steinberg::kNoInterface;
        }
        addRef();
        return Steinberg::kResultOk;
    }
    Steinberg::uint32 PLUGIN_API addRef() override { return ++references_; }
    Steinberg::uint32 PLUGIN_API release() override {
        const auto next = --references_;
        if (next == 0) delete this;
        return next;
    }
    Steinberg::tresult PLUGIN_API initialize(Steinberg::FUnknown*) override {
        initialized_ = true; ui_thread_id_ = GetCurrentThreadId(); return Steinberg::kResultOk;
    }
    Steinberg::tresult PLUGIN_API terminate() override {
        initialized_ = false; return Steinberg::kResultOk;
    }
    Steinberg::tresult PLUGIN_API getControllerClassId(Steinberg::TUID output) override {
        std::memcpy(output, kControllerId, sizeof(Steinberg::TUID)); return Steinberg::kResultTrue;
    }
    Steinberg::tresult PLUGIN_API setIoMode(Steinberg::Vst::IoMode) override {
        return initialized_ ? Steinberg::kResultOk : Steinberg::kNotInitialized;
    }
    Steinberg::int32 PLUGIN_API getBusCount(Steinberg::Vst::MediaType type,
                                            Steinberg::Vst::BusDirection direction) override {
        if (type == Steinberg::Vst::kAudio)
            return direction == Steinberg::Vst::kOutput ? 1 : (instrument_ ? 0 : 1);
        if (type == Steinberg::Vst::kEvent)
            return direction == Steinberg::Vst::kInput && instrument_ ? 1 : 0;
        return 0;
    }
    Steinberg::tresult PLUGIN_API getBusInfo(Steinberg::Vst::MediaType type,
                                             Steinberg::Vst::BusDirection direction,
                                             Steinberg::int32 index,
                                             Steinberg::Vst::BusInfo& info) override {
        if (index != 0 || getBusCount(type, direction) != 1) return Steinberg::kInvalidArgument;
        info = {};
        info.mediaType = type; info.direction = direction;
        info.channelCount = type == Steinberg::Vst::kAudio ? (instrument_ ? 2 : 1) : 16;
        info.busType = Steinberg::Vst::kMain; info.flags = Steinberg::Vst::BusInfo::kDefaultActive;
        set_name(info.name, type == Steinberg::Vst::kAudio ? L"Stereo" : L"Notes");
        return Steinberg::kResultOk;
    }
    Steinberg::tresult PLUGIN_API getRoutingInfo(Steinberg::Vst::RoutingInfo&,
                                                 Steinberg::Vst::RoutingInfo&) override {
        return Steinberg::kNotImplemented;
    }
    Steinberg::tresult PLUGIN_API activateBus(Steinberg::Vst::MediaType,
                                              Steinberg::Vst::BusDirection,
                                              Steinberg::int32 index, Steinberg::TBool) override {
        return index == 0 ? Steinberg::kResultOk : Steinberg::kInvalidArgument;
    }
    Steinberg::tresult PLUGIN_API setActive(Steinberg::TBool state) override {
        active_ = state != 0; return Steinberg::kResultOk;
    }
    Steinberg::tresult PLUGIN_API setState(Steinberg::IBStream* stream) override {
        if (GetCurrentThreadId() != ui_thread_id_) return Steinberg::kResultFalse;
        if (!stream) return Steinberg::kInvalidArgument;
        FixtureState incoming {};
        Steinberg::int32 read = 0;
        if (stream->read(&incoming, sizeof(incoming), &read) != Steinberg::kResultOk ||
            read != sizeof(incoming) || incoming.magic != state_.magic) return Steinberg::kResultFalse;
        state_ = incoming; return Steinberg::kResultOk;
    }
    Steinberg::tresult PLUGIN_API getState(Steinberg::IBStream* stream) override {
        if (GetCurrentThreadId() != ui_thread_id_) return Steinberg::kResultFalse;
        if (!stream) return Steinberg::kInvalidArgument;
        Steinberg::int32 written = 0;
        return stream->write(&state_, sizeof(state_), &written) == Steinberg::kResultOk &&
            written == sizeof(state_) ? Steinberg::kResultOk : Steinberg::kResultFalse;
    }
    Steinberg::tresult PLUGIN_API setBusArrangements(Steinberg::Vst::SpeakerArrangement* inputs,
                                                     Steinberg::int32 input_count,
                                                     Steinberg::Vst::SpeakerArrangement* outputs,
                                                     Steinberg::int32 output_count) override {
        const auto expected = instrument_ ? Steinberg::Vst::SpeakerArr::kStereo : Steinberg::Vst::SpeakerArr::kMono;
        if (output_count != 1 || !outputs || outputs[0] != expected)
            return Steinberg::kResultFalse;
        if (instrument_) return input_count == 0 ? Steinberg::kResultTrue : Steinberg::kResultFalse;
        return input_count == 1 && inputs && inputs[0] == expected
            ? Steinberg::kResultTrue : Steinberg::kResultFalse;
    }
    Steinberg::tresult PLUGIN_API getBusArrangement(Steinberg::Vst::BusDirection direction,
                                                    Steinberg::int32 index,
                                                    Steinberg::Vst::SpeakerArrangement& arrangement) override {
        if (index != 0 || (instrument_ && direction == Steinberg::Vst::kInput))
            return Steinberg::kInvalidArgument;
        arrangement = instrument_ ? Steinberg::Vst::SpeakerArr::kStereo : Steinberg::Vst::SpeakerArr::kMono;
        return Steinberg::kResultOk;
    }
    Steinberg::tresult PLUGIN_API canProcessSampleSize(Steinberg::int32 size) override {
        return size == Steinberg::Vst::kSample32 ? Steinberg::kResultTrue : Steinberg::kResultFalse;
    }
    Steinberg::uint32 PLUGIN_API getLatencySamples() override { return instrument_ ? 0u : 7u; }
    Steinberg::tresult PLUGIN_API setupProcessing(Steinberg::Vst::ProcessSetup& setup) override {
        if (active_ || setup.symbolicSampleSize != Steinberg::Vst::kSample32 ||
            setup.maxSamplesPerBlock <= 0 || setup.maxSamplesPerBlock > 128) return Steinberg::kResultFalse;
        setup_ = setup; return Steinberg::kResultOk;
    }
    Steinberg::tresult PLUGIN_API setProcessing(Steinberg::TBool state) override {
        if (!active_) return Steinberg::kResultFalse;
        if (state) {
            if (GetCurrentThreadId() == ui_thread_id_) return Steinberg::kResultFalse;
            audio_thread_id_ = GetCurrentThreadId();
        } else if (audio_thread_id_ != GetCurrentThreadId()) return Steinberg::kResultFalse;
        processing_ = state != 0; return Steinberg::kResultOk;
    }
    Steinberg::tresult PLUGIN_API process(Steinberg::Vst::ProcessData& data) override {
        if (!processing_ || GetCurrentThreadId() != audio_thread_id_ ||
            data.numSamples < 0 || data.numSamples > setup_.maxSamplesPerBlock ||
            data.numOutputs != 1 || !data.outputs || !data.processContext) return Steinberg::kResultFalse;
        state_.tempo = data.processContext->tempo;
        state_.project_ppq = data.processContext->projectTimeMusic;
        state_.loop_start = data.processContext->cycleStartMusic;
        state_.loop_end = data.processContext->cycleEndMusic;
        state_.project_samples = data.processContext->projectTimeSamples;
        state_.context_flags = data.processContext->state;
        state_.numerator = data.processContext->timeSigNumerator;
        state_.denominator = data.processContext->timeSigDenominator;

        std::array<double, 128> gains {};
        std::fill_n(gains.begin(), data.numSamples, state_.gain);
        if (data.inputParameterChanges) {
            for (Steinberg::int32 queue_index = 0;
                 queue_index < data.inputParameterChanges->getParameterCount(); ++queue_index) {
                auto* queue = data.inputParameterChanges->getParameterData(queue_index);
                if (!queue) continue;
                for (Steinberg::int32 point = 0; point < queue->getPointCount(); ++point) {
                    Steinberg::int32 offset = 0; Steinberg::Vst::ParamValue value = 0;
                    if (queue->getPoint(point, offset, value) != Steinberg::kResultOk ||
                        offset < 0 || offset >= data.numSamples) continue;
                    state_.gain = queue->getParameterId() == 101
                        ? (value < 0.5 ? 0.25 : 0.75)
                        : (std::max)(0.0, (std::min)(1.0, value));
                    std::fill(gains.begin() + offset, gains.begin() + data.numSamples, state_.gain);
                }
            }
        }

        if (instrument_) {
            if (data.numInputs != 0 || !data.inputEvents) return Steinberg::kResultFalse;
            for (Steinberg::int32 frame = 0; frame < data.numSamples; ++frame) {
                for (Steinberg::int32 index = 0; index < data.inputEvents->getEventCount(); ++index) {
                    Steinberg::Vst::Event event {};
                    if (data.inputEvents->getEvent(index, event) != Steinberg::kResultOk ||
                        event.sampleOffset != frame) continue;
                    state_.last_event_ppq = event.ppqPosition;
                    if (event.type == Steinberg::Vst::Event::kNoteOnEvent) amplitude_ = event.noteOn.velocity;
                    if (event.type == Steinberg::Vst::Event::kNoteOffEvent) amplitude_ = 0.0f;
                }
                const float sample = static_cast<float>(amplitude_ * gains[frame]);
                for (Steinberg::int32 channel = 0; channel < data.outputs[0].numChannels; ++channel)
                    data.outputs[0].channelBuffers32[channel][frame] = sample;
            }
        } else {
            if (data.numInputs != 1 || !data.inputs) return Steinberg::kResultFalse;
            for (Steinberg::int32 frame = 0; frame < data.numSamples; ++frame) {
                const auto slot = static_cast<std::size_t>(delay_position_ % 7);
                for (Steinberg::int32 channel = 0; channel < data.outputs[0].numChannels; ++channel) {
                    const float delayed = delay_[channel][slot];
                    delay_[channel][slot] = data.inputs[0].channelBuffers32[channel][frame];
                    data.outputs[0].channelBuffers32[channel][frame] = delayed * static_cast<float>(gains[frame]);
                }
                ++delay_position_;
            }
        }
        return Steinberg::kResultOk;
    }
    Steinberg::uint32 PLUGIN_API getTailSamples() override { return instrument_ ? 0u : 64u; }
    Steinberg::tresult PLUGIN_API connect(Steinberg::Vst::IConnectionPoint* other) override {
        if(!other||GetCurrentThreadId()!=ui_thread_id_)return Steinberg::kInvalidArgument; connected_=true; return Steinberg::kResultOk;
    }
    Steinberg::tresult PLUGIN_API disconnect(Steinberg::Vst::IConnectionPoint*) override { connected_=false; return Steinberg::kResultOk; }
    Steinberg::tresult PLUGIN_API notify(Steinberg::Vst::IMessage*) override { return Steinberg::kResultOk; }

private:
    std::atomic<Steinberg::uint32> references_ {1};
    bool instrument_ {false}; bool initialized_ {false}; bool active_ {false}; bool processing_ {false};
    Steinberg::Vst::ProcessSetup setup_ {};
    FixtureState state_ {};
    float amplitude_ {0.0f}; DWORD ui_thread_id_ {0}; DWORD audio_thread_id_ {0};
    bool connected_ {false};
    std::array<std::array<float, 7>, 2> delay_ {};
    std::uint64_t delay_position_ {0};
};

class FixtureFactory final : public Steinberg::IPluginFactory3 {
public:
    Steinberg::tresult PLUGIN_API queryInterface(const Steinberg::TUID iid, void** object) override {
        if (!object) return Steinberg::kInvalidArgument;
        *object = nullptr;
        if (iid_equal(iid, Steinberg::FUnknown_iid) || iid_equal(iid, Steinberg::IPluginFactory_iid) ||
            iid_equal(iid, Steinberg::IPluginFactory2_iid) || iid_equal(iid, Steinberg::IPluginFactory3_iid)) {
            *object = static_cast<Steinberg::IPluginFactory3*>(this); addRef(); return Steinberg::kResultOk;
        }
        return Steinberg::kNoInterface;
    }
    Steinberg::uint32 PLUGIN_API addRef() override { return ++references_; }
    Steinberg::uint32 PLUGIN_API release() override {
        const auto next = --references_; if (next == 0) delete this; return next;
    }
    Steinberg::tresult PLUGIN_API getFactoryInfo(Steinberg::PFactoryInfo* info) override {
        if (!info) return Steinberg::kInvalidArgument;
        *info = Steinberg::PFactoryInfo("Pocket DAW Tests", "https://example.invalid", "",
            Steinberg::PFactoryInfo::kNoFlags); return Steinberg::kResultOk;
    }
    Steinberg::int32 PLUGIN_API countClasses() override { return 3; }
    Steinberg::tresult PLUGIN_API getClassInfo(Steinberg::int32 index, Steinberg::PClassInfo* info) override {
        if (!info || index < 0 || index >= 3) return Steinberg::kInvalidArgument;
        *info = index == 2
            ? Steinberg::PClassInfo(kControllerId, Steinberg::PClassInfo::kManyInstances,
                kVstComponentControllerClass, "Pocket DAW Fixture Controller")
            : Steinberg::PClassInfo(index == 0 ? kInstrumentId : kEffectId,
                Steinberg::PClassInfo::kManyInstances, kVstAudioEffectClass,
                index == 0 ? "Pocket DAW Fixture Instrument" : "Pocket DAW Fixture Effect");
        return Steinberg::kResultOk;
    }
    Steinberg::tresult PLUGIN_API createInstance(Steinberg::FIDString cid, Steinberg::FIDString iid,
                                                 void** object) override {
        if (!object) return Steinberg::kInvalidArgument;
        *object = nullptr;
        if (iid_equal(cid, kControllerId) && iid_equal(iid, Steinberg::Vst::IEditController_iid)) {
            *object = static_cast<Steinberg::Vst::IEditController*>(new FixtureController());
            return Steinberg::kResultOk;
        }
        if (!iid_equal(iid, Steinberg::Vst::IComponent_iid)) return Steinberg::kNoInterface;
        const bool instrument = iid_equal(cid, kInstrumentId);
        if (!instrument && !iid_equal(cid, kEffectId)) return Steinberg::kNoInterface;
        *object = static_cast<Steinberg::Vst::IComponent*>(new FixtureProcessor(instrument));
        return Steinberg::kResultOk;
    }
    Steinberg::tresult PLUGIN_API getClassInfo2(Steinberg::int32 index, Steinberg::PClassInfo2* info) override {
        if (!info || index < 0 || index >= 3) return Steinberg::kInvalidArgument;
        if (index == 2) {
            *info = Steinberg::PClassInfo2(kControllerId, Steinberg::PClassInfo::kManyInstances,
                kVstComponentControllerClass, "Pocket DAW Fixture Controller", 0, "",
                "Pocket DAW Tests", "2.0.0", kVstVersionString);
            return Steinberg::kResultOk;
        }
        *info = Steinberg::PClassInfo2(index == 0 ? kInstrumentId : kEffectId,
            Steinberg::PClassInfo::kManyInstances, kVstAudioEffectClass,
            index == 0 ? "Pocket DAW Fixture Instrument" : "Pocket DAW Fixture Effect", 0,
            index == 0 ? "Instrument|Synth" : "Fx|Dynamics", "Pocket DAW Tests", "2.0.0",
            kVstVersionString); return Steinberg::kResultOk;
    }
    Steinberg::tresult PLUGIN_API getClassInfoUnicode(Steinberg::int32 index,
                                                      Steinberg::PClassInfoW* info) override {
        if (!info) return Steinberg::kInvalidArgument;
        Steinberg::PClassInfo2 ascii {};
        if (getClassInfo2(index, &ascii) != Steinberg::kResultOk) return Steinberg::kInvalidArgument;
        info->fromAscii(ascii); return Steinberg::kResultOk;
    }
    Steinberg::tresult PLUGIN_API setHostContext(Steinberg::FUnknown*) override {
        return Steinberg::kResultOk;
    }
private:
    std::atomic<Steinberg::uint32> references_ {1};
};

} // namespace

extern "C" __declspec(dllexport) Steinberg::IPluginFactory* PLUGIN_API GetPluginFactory() {
    return new FixtureFactory();
}
