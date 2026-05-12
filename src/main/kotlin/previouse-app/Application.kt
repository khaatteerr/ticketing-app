package com.helpdesk

import com.helpdesk.database.DatabaseFactory
import com.helpdesk.plugins.*
import io.ktor.server.application.*
import io.ktor.server.netty.*

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
