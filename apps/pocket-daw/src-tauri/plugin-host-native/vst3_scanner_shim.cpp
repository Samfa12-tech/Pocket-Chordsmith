#include "pluginterfaces/base/ipluginbase.h"
#include "pluginterfaces/vst/ivstaudioprocessor.h"

#include <windows.h>

#include <algorithm>
#include <cstdint>
#include <cstring>
#include <string>

namespace {

constexpr std::size_t kMaxDescriptors = 256;

struct Descriptor {
    char class_id[33];
    char vendor[65];
    char name[129];
    char version[65];
    char category[33];
    char sub_categories[129];
    std::uint8_t supports_instrument_role;
    std::uint8_t supports_effect_role;
    std::uint8_t reserved[6];
};

using GetFactoryProc = Steinberg::IPluginFactory* (PLUGIN_API*)();
using InitModuleProc = bool (PLUGIN_API*)();
using ExitModuleProc = bool (PLUGIN_API*)();

void copy_utf8(char* output, std::size_t capacity, const char* input, std::size_t input_capacity) {
    if (!output || capacity == 0) return;
    output[0] = 0;
    if (!input) return;
    const auto length = strnlen_s(input, input_capacity);
    const auto count = (std::min)(length, capacity - 1);
    std::memcpy(output, input, count);
    output[count] = 0;
}

void copy_utf16(char* output, std::size_t capacity, const Steinberg::char16* input, std::size_t input_capacity) {
    if (!output || capacity == 0) return;
    output[0] = 0;
    std::size_t length = 0;
    while (length < input_capacity && input[length] != 0) ++length;
    if (length == 0) return;
    const auto required = WideCharToMultiByte(CP_UTF8, WC_ERR_INVALID_CHARS,
        reinterpret_cast<const wchar_t*>(input), static_cast<int>(length), nullptr, 0, nullptr, nullptr);
    if (required <= 0) return;
    std::string utf8(static_cast<std::size_t>(required), '\0');
    if (WideCharToMultiByte(CP_UTF8, WC_ERR_INVALID_CHARS,
            reinterpret_cast<const wchar_t*>(input), static_cast<int>(length), utf8.data(), required,
            nullptr, nullptr) <= 0) return;
    copy_utf8(output, capacity, utf8.data(), utf8.size());
}

void class_id_to_hex(char output[33], const Steinberg::TUID cid) {
    static constexpr char hex[] = "0123456789ABCDEF";
    // VST3 uses COM-compatible byte order on Windows. Persist the canonical
    // cross-platform FUID string so the same class identity is stable on disk.
    static constexpr std::size_t order[16] = {
        3, 2, 1, 0, 5, 4, 7, 6, 8, 9, 10, 11, 12, 13, 14, 15
    };
    for (std::size_t index = 0; index < 16; ++index) {
        const auto byte = static_cast<unsigned char>(cid[order[index]]);
        output[index * 2] = hex[byte >> 4];
        output[index * 2 + 1] = hex[byte & 0x0F];
    }
    output[32] = 0;
}

bool is_audio_class(const char* category) {
    return category && std::strncmp(category, kVstAudioEffectClass,
        Steinberg::PClassInfo::kCategorySize) == 0;
}

bool is_instrument(const char* sub_categories) {
    return sub_categories && std::strstr(sub_categories, "Instrument") != nullptr;
}

std::wstring module_binary_path(const wchar_t* module_path) {
    std::wstring path(module_path ? module_path : L"");
    if (path.empty()) return {};
    const auto attributes = GetFileAttributesW(path.c_str());
    if (attributes == INVALID_FILE_ATTRIBUTES) return {};
    if ((attributes & FILE_ATTRIBUTE_DIRECTORY) == 0) return path;
    const auto slash = path.find_last_of(L"\\/");
    const std::wstring filename = slash == std::wstring::npos ? path : path.substr(slash + 1);
    if (!path.empty() && path.back() != L'\\' && path.back() != L'/') path.push_back(L'\\');
    path.append(L"Contents\\x86_64-win\\").append(filename);
    return path;
}

void fill_descriptor(Descriptor& output, const Steinberg::PClassInfo2& info,
                     const Steinberg::PFactoryInfo& factory) {
    std::memset(&output, 0, sizeof(output));
    class_id_to_hex(output.class_id, info.cid);
    copy_utf8(output.vendor, sizeof(output.vendor),
        info.vendor[0] ? info.vendor : factory.vendor,
        info.vendor[0] ? sizeof(info.vendor) : sizeof(factory.vendor));
    copy_utf8(output.name, sizeof(output.name), info.name, sizeof(info.name));
    copy_utf8(output.version, sizeof(output.version), info.version, sizeof(info.version));
    copy_utf8(output.category, sizeof(output.category), info.category, sizeof(info.category));
    copy_utf8(output.sub_categories, sizeof(output.sub_categories), info.subCategories,
        sizeof(info.subCategories));
    output.supports_instrument_role = is_instrument(info.subCategories) ? 1 : 0;
    output.supports_effect_role = output.supports_instrument_role ? 0 : 1;
}

void fill_descriptor(Descriptor& output, const Steinberg::PClassInfoW& info,
                     const Steinberg::PFactoryInfo& factory) {
    std::memset(&output, 0, sizeof(output));
    class_id_to_hex(output.class_id, info.cid);
    copy_utf16(output.vendor, sizeof(output.vendor), info.vendor, 64);
    if (output.vendor[0] == 0)
        copy_utf8(output.vendor, sizeof(output.vendor), factory.vendor, sizeof(factory.vendor));
    copy_utf16(output.name, sizeof(output.name), info.name, 64);
    copy_utf16(output.version, sizeof(output.version), info.version, 64);
    copy_utf8(output.category, sizeof(output.category), info.category, sizeof(info.category));
    copy_utf8(output.sub_categories, sizeof(output.sub_categories), info.subCategories,
        sizeof(info.subCategories));
    output.supports_instrument_role = is_instrument(info.subCategories) ? 1 : 0;
    output.supports_effect_role = output.supports_instrument_role ? 0 : 1;
}

} // namespace

extern "C" int pocket_daw_vst3_scan_module(const wchar_t* module_path, Descriptor* output,
    std::size_t capacity, std::size_t* output_count) noexcept {
    if (!module_path || !output || !output_count || capacity == 0) return 1;
    *output_count = 0;
    try {
        const auto binary = module_binary_path(module_path);
        if (binary.empty()) return 2;
        const auto library = LoadLibraryExW(binary.c_str(), nullptr,
            LOAD_LIBRARY_SEARCH_DLL_LOAD_DIR | LOAD_LIBRARY_SEARCH_DEFAULT_DIRS);
        if (!library) return 2;

        const auto exit_proc = reinterpret_cast<ExitModuleProc>(GetProcAddress(library, "ExitDll"));
        const auto finish = [&](Steinberg::IPluginFactory* factory,
                                Steinberg::IPluginFactory2* factory2,
                                Steinberg::IPluginFactory3* factory3,
                                int code) {
            if (factory3) factory3->release();
            if (factory2) factory2->release();
            if (factory) factory->release();
            if (exit_proc) exit_proc();
            FreeLibrary(library);
            return code;
        };

        const auto get_factory = reinterpret_cast<GetFactoryProc>(GetProcAddress(library, "GetPluginFactory"));
        if (!get_factory) return finish(nullptr, nullptr, nullptr, 3);
        const auto init_proc = reinterpret_cast<InitModuleProc>(GetProcAddress(library, "InitDll"));
        if (init_proc && !init_proc()) return finish(nullptr, nullptr, nullptr, 4);
        auto* factory = get_factory();
        if (!factory) return finish(nullptr, nullptr, nullptr, 5);

        Steinberg::PFactoryInfo factory_info {};
        factory->getFactoryInfo(&factory_info);
        Steinberg::IPluginFactory3* factory3 = nullptr;
        Steinberg::IPluginFactory2* factory2 = nullptr;
        factory->queryInterface(Steinberg::IPluginFactory3_iid,
            reinterpret_cast<void**>(&factory3));
        if (!factory3)
            factory->queryInterface(Steinberg::IPluginFactory2_iid,
                reinterpret_cast<void**>(&factory2));

        const auto class_count = factory->countClasses();
        if (class_count < 0 || static_cast<std::size_t>(class_count) > kMaxDescriptors)
            return finish(factory, factory2, factory3, 6);
        for (Steinberg::int32 index = 0; index < class_count; ++index) {
            Descriptor descriptor {};
            bool valid = false;
            if (factory3) {
                Steinberg::PClassInfoW info {};
                if (factory3->getClassInfoUnicode(index, &info) == Steinberg::kResultTrue &&
                    is_audio_class(info.category)) {
                    fill_descriptor(descriptor, info, factory_info);
                    valid = true;
                }
            } else if (factory2) {
                Steinberg::PClassInfo2 info {};
                if (factory2->getClassInfo2(index, &info) == Steinberg::kResultTrue &&
                    is_audio_class(info.category)) {
                    fill_descriptor(descriptor, info, factory_info);
                    valid = true;
                }
            } else {
                Steinberg::PClassInfo info {};
                if (factory->getClassInfo(index, &info) == Steinberg::kResultTrue &&
                    is_audio_class(info.category)) {
                    Steinberg::PClassInfo2 promoted(info.cid, info.cardinality, info.category,
                        info.name, 0, "", factory_info.vendor, "", "");
                    fill_descriptor(descriptor, promoted, factory_info);
                    valid = true;
                }
            }
            if (!valid) continue;
            if (*output_count >= capacity)
                return finish(factory, factory2, factory3, 7);
            output[*output_count] = descriptor;
            ++(*output_count);
        }
        return finish(factory, factory2, factory3, 0);
    } catch (...) {
        return 8;
    }
}
