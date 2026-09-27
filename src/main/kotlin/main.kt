package com.eraqi

import com.eraqi.ticketing.DatabaseFactory
import com.eraqi.ticketing.configureCORS
import com.eraqi.ticketing.configureCallLogging
import com.eraqi.ticketing.configureRouting
import com.eraqi.ticketing.configureSecurity
import com.eraqi.ticketing.configureSerialization
import com.eraqi.ticketing.configureStatusPages
import com.eraqi.ticketing.setupAd
import io.ktor.server.application.*
import io.ktor.server.netty.EngineMain


fun main(args: Array<String>) = EngineMain.main(args)

//fun Application.module() {
//    DatabaseFactory.init(environment.config)
//    configureSecurity()
//    configureSerialization()
//    configureCORS()
//    configureStatusPages()
//    configureCallLogging()
//    configureRouting()
//}


fun Application.module() {
    DatabaseFactory.init(environment.config)

    configureSerialization()
    configureCORS()
    configureCallLogging()
    configureSecurity()      // sets up JwtConfig + JWT auth — must run before setupAd()/routing
    configureStatusPages()

    setupAd()                // starts the AD sync loop and fills DatabaseFactory.ldap

    configureRouting()
}
