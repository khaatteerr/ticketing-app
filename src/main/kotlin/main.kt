package com.eraqi

import com.helpdesk.database.DatabaseFactory
import com.helpdesk.plugins.configureCORS
import com.helpdesk.plugins.configureCallLogging
import com.helpdesk.plugins.configureRouting
import com.helpdesk.plugins.configureSecurity
import com.helpdesk.plugins.configureSerialization
import com.helpdesk.plugins.configureStatusPages
import io.ktor.server.engine.*
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
