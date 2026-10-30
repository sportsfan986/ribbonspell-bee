plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.ribbonspell.bee"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.ribbonspell.bee"
        minSdk = 26
        targetSdk = 35
        versionCode = 111
        versionName = "1.11"
    }

    signingConfigs {
        create("release") {
            val ksFile = file("release.keystore")
            if (ksFile.exists()) {
                storeFile = ksFile
                storePassword = System.getenv("RELEASE_STORE_PASSWORD") ?: "ribbonspell123"
                keyAlias = System.getenv("RELEASE_KEY_ALIAS") ?: "ribbonkey"
                keyPassword = System.getenv("RELEASE_KEY_PASSWORD") ?: "ribbonspell123"
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            val relSigning = signingConfigs.findByName("release")
            if (relSigning?.storeFile?.exists() == true) {
                try {
                    signingConfig = relSigning
                } catch (_: Exception) {
                    signingConfig = signingConfigs.getByName("debug")
                }
            } else {
                signingConfig = signingConfigs.getByName("debug")
            }
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("com.google.android.material:material:1.12.0")
    implementation("androidx.webkit:webkit:1.11.0")
}
