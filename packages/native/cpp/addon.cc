#include <napi.h>

#include <memory>
#include <string>
#include <utility>
#include <vector>

#include "aggregate.h"
#include "windows_scan.h"

namespace {

std::wstring wide_string(const Napi::Value& value) {
    const auto text = value.As<Napi::String>().Utf16Value();
    return std::wstring(text.begin(), text.end());
}

Napi::String js_string(Napi::Env env, const std::wstring& value) {
    return Napi::String::New(env, std::u16string(value.begin(), value.end()));
}

Napi::Array js_tree(Napi::Env env, const std::vector<volaris::TreeNode>& nodes) {
    auto tree = Napi::Array::New(env, nodes.size());
    for (size_t i = 0; i < nodes.size(); ++i) {
        Napi::HandleScope scope(env);
        const auto& node = nodes[i];
        auto item = Napi::Object::New(env);
        item.Set("parent", Napi::Number::New(env, static_cast<double>(node.parent)));
        item.Set("name", js_string(env, node.name));
        item.Set("size", Napi::Number::New(env, static_cast<double>(node.size)));
        tree.Set(static_cast<uint32_t>(i), item);
    }
    return tree;
}

class ScanWorker final : public Napi::AsyncWorker {
public:
    ScanWorker(Napi::Env env, std::wstring root, unsigned depth, std::vector<std::wstring> rules,
               bool include_tree)
        : Napi::AsyncWorker(env, "volaris:ntfs"), deferred_(Napi::Promise::Deferred::New(env)),
          root_(std::move(root)), depth_(depth), rules_(std::move(rules)), include_tree_(include_tree) {}

    Napi::Promise promise() const { return deferred_.Promise(); }

private:
    void Execute() override {
        try {
            rows_ = volaris::scan(root_, depth_, rules_, include_tree_);
        } catch (const volaris::ScanError& e) {
            error_code_ = e.code;
            SetError(e.what());
        }
    }

    void OnError(const Napi::Error& error) override {
        error.Value().Set("code", error_code_);
        deferred_.Reject(error.Value());
    }

    void OnOK() override {
        auto env = Env();
        auto results = Napi::Array::New(env, rows_.size());
        for (size_t i = 0; i < rows_.size(); ++i) {
            Napi::HandleScope scope(env);
            const auto& row = rows_[i];
            auto item = Napi::Object::New(env);
            item.Set("path", js_string(env, row.path));
            item.Set("name", js_string(env, row.name));
            item.Set("size", Napi::Number::New(env, static_cast<double>(row.size)));
            item.Set("fileCount", Napi::Number::New(env, static_cast<double>(row.fileCount)));
            item.Set("dirCount", Napi::Number::New(env, static_cast<double>(row.dirCount)));
            item.Set("errorCount", Napi::Number::New(env, static_cast<double>(row.errorCount)));
            item.Set("skippedCount", Napi::Number::New(env, static_cast<double>(row.skippedCount)));
            if (include_tree_) item.Set("tree", js_tree(env, row.tree));
            results.Set(static_cast<uint32_t>(i), item);
        }
        deferred_.Resolve(results);
    }

    Napi::Promise::Deferred deferred_;
    std::wstring root_;
    unsigned depth_;
    std::vector<std::wstring> rules_;
    bool include_tree_;
    std::vector<volaris::Result> rows_;
    std::string error_code_ = "ERR_NTFS_SCAN";
};

Napi::Value start_scan(const Napi::CallbackInfo& info) {
    auto rules = info[2].As<Napi::Array>();
    std::vector<std::wstring> ignore_rules;
    for (uint32_t i = 0; i < rules.Length(); ++i) {
        ignore_rules.push_back(wide_string(rules.Get(i)));
    }
    const bool include_tree = info.Length() > 3 && info[3].As<Napi::Boolean>().Value();
    auto worker = std::make_unique<ScanWorker>(
        info.Env(), wide_string(info[0]), info[1].As<Napi::Number>().Uint32Value(),
        std::move(ignore_rules), include_tree);
    auto promise = worker->promise();
    worker->Queue();
    worker.release();  // AsyncWorker owns its lifetime once queued.
    return promise;
}

Napi::Object init(Napi::Env env, Napi::Object exports) {
    exports.Set("scan", Napi::Function::New(env, start_scan));
    exports.Set("supportsTree", true);
    return exports;
}

}  // namespace

NODE_API_MODULE(volaris_ntfs, init)
