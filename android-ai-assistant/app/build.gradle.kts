import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "kr.fieldassistant.prototype"
    compileSdk = 35
    defaultConfig {
        applicationId = "kr.fieldassistant.prototype"
        minSdk = 31
        targetSdk = 35
        versionCode = 1
        versionName = "0.1-test"
    }
    compileOptions { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }
}
dependencies {
    implementation("androidx.documentfile:documentfile:1.0.1")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.9.0")
    implementation("com.google.mlkit:genai-speech-recognition:1.0.0-alpha2")
    implementation("com.google.mlkit:genai-prompt:1.0.0-beta4")
}

kotlin { compilerOptions { jvmTarget.set(JvmTarget.JVM_17) } }
