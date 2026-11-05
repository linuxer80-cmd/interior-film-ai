#include <jni.h>
#include <whisper.h>
#include <algorithm>
#include <chrono>
#include <string>
#include <vector>
#include <thread>

static void fail(JNIEnv *env, const char *message) {
    env->ThrowNew(env->FindClass("java/lang/IllegalStateException"), message);
}
extern "C" JNIEXPORT jlong JNICALL
Java_kr_fieldassistant_prototype_WhisperNative_open(JNIEnv *env, jobject, jstring path) {
    const char *p=env->GetStringUTFChars(path,nullptr);
    auto params=whisper_context_default_params(); params.use_gpu=false;
    auto *ctx=whisper_init_from_file_with_params(p,params);
    env->ReleaseStringUTFChars(path,p);
    if(!ctx) fail(env,"Whisper model could not be loaded");
    return reinterpret_cast<jlong>(ctx);
}
extern "C" JNIEXPORT void JNICALL
Java_kr_fieldassistant_prototype_WhisperNative_close(JNIEnv *, jobject, jlong handle) {
    whisper_free(reinterpret_cast<whisper_context *>(handle));
}
extern "C" JNIEXPORT jstring JNICALL
Java_kr_fieldassistant_prototype_WhisperNative_transcribe(JNIEnv *env,jobject,jlong handle,jfloatArray audio) {
    const int n=env->GetArrayLength(audio);
    if(n<1600) return env->NewStringUTF("");
    std::vector<float> pcm(n); env->GetFloatArrayRegion(audio,0,n,pcm.data());
    auto *ctx=reinterpret_cast<whisper_context *>(handle);
    auto params=whisper_full_default_params(WHISPER_SAMPLING_GREEDY);
    params.n_threads=std::min(4u,std::max(1u,std::thread::hardware_concurrency()));
    params.language="ko"; params.translate=false; params.no_context=true;
    params.no_timestamps=true; params.print_progress=false; params.print_realtime=false;
    params.print_timestamps=false; params.print_special=false;
    params.temperature=0.0f; params.temperature_inc=0.0f; params.greedy.best_of=1;
    params.suppress_blank=true; params.suppress_nst=true;
    auto deadline=std::chrono::steady_clock::now()+std::chrono::seconds(std::min(900,std::max(120,n/16000*3)));
    params.abort_callback=[](void *p) { return std::chrono::steady_clock::now()>*static_cast<std::chrono::steady_clock::time_point *>(p); };
    params.abort_callback_user_data=&deadline;
    if(whisper_full(ctx,params,pcm.data(),n)!=0) { fail(env,"Whisper transcription failed or timed out"); return nullptr; }
    std::string result;
    for(int i=0;i<whisper_full_n_segments(ctx);i++) result+=whisper_full_get_segment_text(ctx,i);
    return env->NewStringUTF(result.c_str());
}
