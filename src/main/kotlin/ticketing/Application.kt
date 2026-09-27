package com.eraqi.ticketing

import io.ktor.server.application.*

// application.yaml must point here:
//   ktor:
//     application:
//       modules: [ com.eraqi.ticketing.ApplicationKt.module ]
fun main(args: Array<String>) {
    io.ktor.server.netty.EngineMain.main(args)
}

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
