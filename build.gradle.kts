plugins {
    alias(libs.plugins.kotlin.jvm)
    alias(ktorLibs.plugins.ktor)
    kotlin("plugin.serialization") version "1.9.23"
    application
    id("com.gradleup.shadow") version "9.1.0"
}

group = "com.eraqi"
version = "1.0.0-SNAPSHOT"


kotlin {
    jvmToolchain(21)
}

application {
    mainClass.set("io.ktor.server.netty.EngineMain")
    applicationDefaultJvmArgs = listOf("-Dio.ktor.development=true")
}
val ktor_version = "2.3.10"
val kotlin_version = "1.9.23"
val logback_version = "1.4.14"
val kmongo_version = "4.11.0"

dependencies {
    implementation(ktorLibs.server.config.yaml)
    implementation(ktorLibs.server.core)
    implementation(ktorLibs.server.netty)
    implementation(libs.logback.classic)

    // Ktor core
    implementation("io.ktor:ktor-server-core-jvm:${ktor_version}")
    implementation("io.ktor:ktor-server-netty-jvm:${ktor_version}")
    implementation("io.ktor:ktor-server-content-negotiation-jvm:${ktor_version}")
    implementation("io.ktor:ktor-serialization-kotlinx-json-jvm:${ktor_version}")
    implementation("io.ktor:ktor-server-cors-jvm:${ktor_version}")
    implementation("io.ktor:ktor-server-call-logging-jvm:${ktor_version}")
    implementation("io.ktor:ktor-server-status-pages-jvm:${ktor_version}")
    implementation("io.ktor:ktor-server-auth-jvm:${ktor_version}")
    implementation("io.ktor:ktor-server-auth-jwt-jvm:${ktor_version}")
    implementation("io.ktor:ktor-server-sessions-jvm:${ktor_version}")
    implementation("io.ktor:ktor-server-request-validation-jvm:${ktor_version}")

    testImplementation(kotlin("test"))
    testImplementation(ktorLibs.server.testHost)


    // MongoDB via KMongo
    implementation("org.litote.kmongo:kmongo-coroutine-serialization:$kmongo_version")

    // Password hashing
    implementation("org.mindrot:jbcrypt:0.4")

    // JWT
    implementation("com.auth0:java-jwt:4.4.0")

    // Logging
    implementation("ch.qos.logback:logback-classic:$logback_version")

    // Kotlinx
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-core:1.7.3")
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.6.3")

    implementation("com.unboundid:unboundid-ldapsdk:7.0.1")
}
tasks {
    shadowJar {
        archiveFileName.set("ticketing.jar")
        manifest {
            attributes["Main-Class"] = "io.ktor.server.netty.EngineMain"
        }
        mergeServiceFiles() // important for Ktor service discovery
    }
}
repositories {
    mavenCentral()
}