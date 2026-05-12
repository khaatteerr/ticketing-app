//import org.jetbrains.kotlin.gradle.tasks.KotlinCompile
//
//plugins {
//    kotlin("jvm") version "1.9.23"
//    id("io.ktor.plugin") version "2.3.10"
//    kotlin("plugin.serialization") version "1.9.23"
//    application
//}
//
//group = "com.helpdesk"
//version = "1.0.0"
//
//application {
//    mainClass.set("com.helpdesk.ApplicationKt")
//    applicationDefaultJvmArgs = listOf("-Dio.ktor.development=true")
//}
//
//repositories {
//    mavenCentral()
//}
//
//val ktor_version = "2.3.10"
//val kotlin_version = "1.9.23"
//val logback_version = "1.4.14"
//val kmongo_version = "4.11.0"
//
//dependencies {
//    // Ktor core
//    implementation("io.ktor:ktor-server-core-jvm:$ktor_version")
//    implementation("io.ktor:ktor-server-netty-jvm:$ktor_version")
//    implementation("io.ktor:ktor-server-content-negotiation-jvm:$ktor_version")
//    implementation("io.ktor:ktor-serialization-kotlinx-json-jvm:$ktor_version")
//    implementation("io.ktor:ktor-server-cors-jvm:$ktor_version")
//    implementation("io.ktor:ktor-server-call-logging-jvm:$ktor_version")
//    implementation("io.ktor:ktor-server-status-pages-jvm:$ktor_version")
//    implementation("io.ktor:ktor-server-auth-jvm:$ktor_version")
//    implementation("io.ktor:ktor-server-auth-jwt-jvm:$ktor_version")
//    implementation("io.ktor:ktor-server-sessions-jvm:$ktor_version")
//    implementation("io.ktor:ktor-server-request-validation-jvm:$ktor_version")
//
//    // MongoDB via KMongo
//    implementation("org.litote.kmongo:kmongo-coroutine-serialization:$kmongo_version")
//
//    // Password hashing
//    implementation("org.mindrot:jbcrypt:0.4")
//
//    // JWT
//    implementation("com.auth0:java-jwt:4.4.0")
//
//    // Logging
//    implementation("ch.qos.logback:logback-classic:$logback_version")
//
//    // Kotlinx
//    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-core:1.7.3")
//    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.6.3")
//
//    // Tests
//    testImplementation("io.ktor:ktor-server-tests-jvm:$ktor_version")
//    testImplementation("org.jetbrains.kotlin:kotlin-test-junit:$kotlin_version")
//}
//
//tasks.withType<KotlinCompile> {
//    kotlinOptions.jvmTarget = "17"
//}
