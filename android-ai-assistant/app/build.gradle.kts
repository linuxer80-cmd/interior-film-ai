import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.serialization")
}

android {
    namespace = "kr.fieldassistant.prototype"
    compileSdk = 35
    defaultConfig {
        applicationId = "kr.fieldassistant.prototype.login"
        minSdk = 31
        targetSdk = 35
        versionCode = 2
        versionName = "0.2-login-test"
    }
    compileOptions { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }
}
dependencies {
    implementation(platform("io.github.jan-tennert.supabase:bom:3.5.0"))
    implementation("io.github.jan-tennert.supabase:auth-kt")
    implementation("io.github.jan-tennert.supabase:postgrest-kt")
    implementation("io.ktor:ktor-client-android:3.0.3")
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.9.0")
    implementation("androidx.documentfile:documentfile:1.0.1")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.9.0")
    implementation("com.google.mlkit:genai-speech-recognition:1.0.0-alpha2")
    implementation("com.google.mlkit:genai-prompt:1.0.0-beta4")
}

kotlin { compilerOptions { jvmTarget.set(JvmTarget.JVM_17) } }
