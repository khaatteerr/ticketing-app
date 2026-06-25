package com.eraqi

import com.eraqi.ticketing.DatabaseFactory
import com.eraqi.ticketing.configureCORS
import com.eraqi.ticketing.configureCallLogging
import com.eraqi.ticketing.configureRouting
import com.eraqi.ticketing.configureSecurity
import com.eraqi.ticketing.configureSerialization
import com.eraqi.ticketing.configureStatusPages
import io.ktor.server.application.*
import io.ktor.server.netty.EngineMain


fun main(args: Array<String>) = EngineMain.main(args)

fun Application.module() {
    DatabaseFactory.init(environment.config)
    configureSecurity()
    configureSerialization()
    configureCORS()
    configureStatusPages()
    configureCallLogging()
    configureRouting()
}
