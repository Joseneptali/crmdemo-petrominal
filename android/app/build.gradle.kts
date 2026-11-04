plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
    id("org.jetbrains.kotlin.plugin.serialization")
}

// Firma: si el CI trae un keystore propio (secretos ANDROID_KEYSTORE_*), se
// usa ese; si no, el keystore del repo, para que cada versión nueva se pueda
// instalar encima de la anterior sin desinstalar.
val keystorePath = System.getenv("ANDROID_KEYSTORE_PATH") ?: "keystore/syrtel-crm.jks"
val keystorePass = System.getenv("ANDROID_KEYSTORE_PASSWORD") ?: "syrtelcrm"
val keyAliasName = System.getenv("ANDROID_KEY_ALIAS") ?: "syrtelcrm"
val keyPass = System.getenv("ANDROID_KEY_PASSWORD") ?: keystorePass

android {
    namespace = "com.syrtel.crm"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.syrtel.crm"
        minSdk = 26
        targetSdk = 35
        versionCode = (System.getenv("VERSION_CODE") ?: "1").toInt()
        versionName = "1.0.${System.getenv("VERSION_CODE") ?: "0"}"
        // URL del CRM que trae la app de fábrica (se puede cambiar al entrar).
        buildConfigField(
            "String",
            "DEFAULT_SERVER",
            "\"${System.getenv("CRM_URL") ?: "https://crm-demo-crmdemo.q1kykd.easypanel.host"}\""
        )
    }

    signingConfigs {
        create("app") {
            storeFile = rootProject.file(keystorePath)
            storePassword = keystorePass
            keyAlias = keyAliasName
            keyPassword = keyPass
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            isShrinkResources = false
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            signingConfig = signingConfigs.getByName("app")
        }
        debug {
            signingConfig = signingConfigs.getByName("app")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }

    buildFeatures {
        compose = true
        buildConfig = true
    }
}

dependencies {
    val composeBom = platform("androidx.compose:compose-bom:2024.12.01")
    implementation(composeBom)
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.material:material-icons-extended")
    implementation("androidx.compose.ui:ui-tooling-preview")
    debugImplementation("androidx.compose.ui:ui-tooling")

    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.activity:activity-compose:1.9.3")
    implementation("androidx.navigation:navigation-compose:2.8.5")
    implementation("androidx.lifecycle:lifecycle-runtime-compose:2.8.7")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.8.7")
    implementation("androidx.lifecycle:lifecycle-process:2.8.7")
    implementation("androidx.work:work-runtime-ktx:2.10.0")

    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    implementation("com.squareup.okhttp3:okhttp-sse:4.12.0")
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.7.3")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.9.0")
    implementation("io.coil-kt:coil-compose:2.7.0")
}
