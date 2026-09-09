import java.net.URI

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

val forgeWebOrigin = providers.gradleProperty("FORGE_WEB_ORIGIN")
    .orElse("https://forge.invalid")
    .get()
val forgeAppName = providers.gradleProperty("APP_NAME")
    .orElse("PromptStudio AI")
    .get()
val forgePackageId = providers.gradleProperty("PACKAGE_ID")
    .orElse("in.promptstudio.ai")
    .get()
val forgeVersionName = providers.gradleProperty("VERSION_NAME")
    .orElse("0.1.0")
    .get()
val forgeVersionCode = providers.gradleProperty("VERSION_CODE")
    .orElse("1")
    .get()
    .toInt()
val googleWebClientId = providers.gradleProperty("GOOGLE_WEB_CLIENT_ID")
    .orElse("")
    .get()
val firebaseAndroidAppId = providers.gradleProperty("FIREBASE_ANDROID_APP_ID")
    .orElse("")
    .get()

if (googleWebClientId.isBlank()) {
    throw GradleException("GOOGLE_WEB_CLIENT_ID is required for Forge native Google Sign-In")
}
if (firebaseAndroidAppId.isBlank()) {
    throw GradleException("FIREBASE_ANDROID_APP_ID is required for native Firebase initialization")
}

val forgeWebHost = URI(forgeWebOrigin).host
    ?: throw GradleException("FORGE_WEB_ORIGIN must contain a valid HTTPS host")

android {
    namespace = "promptstudio.ai"
    compileSdk = 35

    defaultConfig {
        applicationId = forgePackageId
        minSdk = 26
        targetSdk = 35
        versionCode = forgeVersionCode
        versionName = forgeVersionName
        resValue("string", "app_name", forgeAppName)
        resValue("string", "google_web_client_id", googleWebClientId)
        buildConfigField("String", "FORGE_WEB_ORIGIN", "\"$forgeWebOrigin\"")
        buildConfigField("String", "FIREBASE_ANDROID_APP_ID", "\"$firebaseAndroidAppId\"")
        buildConfigField("String", "FIREBASE_API_KEY", "\"AIzaSyB34-r9vGA1G-12YiHqt99PZ7AA8Ghzlmg\"")
        buildConfigField("String", "FIREBASE_PROJECT_ID", "\"promptstudio-ai-d31b8\"")
        buildConfigField("String", "FIREBASE_MESSAGING_SENDER_ID", "\"768747699651\"")
        manifestPlaceholders["forgeWebHost"] = forgeWebHost
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    buildFeatures {
        buildConfig = true
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
    }
}

dependencies {
    implementation(platform("com.google.firebase:firebase-bom:34.18.0"))
    implementation("com.google.firebase:firebase-auth")
    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("androidx.activity:activity-ktx:1.10.0")
    implementation("androidx.webkit:webkit:1.12.1")
    implementation("androidx.credentials:credentials:1.6.0")
    implementation("androidx.credentials:credentials-play-services-auth:1.6.0")
    implementation("com.google.android.libraries.identity.googleid:googleid:1.2.0")
}
