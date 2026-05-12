package com.helpdesk.plugins

import com.helpdesk.utils.JwtConfig
import io.ktor.server.application.*
import io.ktor.server.auth.*
import io.ktor.server.auth.jwt.*
import io.ktor.server.config.tryGetString

fun Application.configureSecurity() {
    val config = environment.config

    JwtConfig.init(config)

    install(Authentication) {
        jwt("auth-jwt") {
            realm = config.tryGetString("jwt.realm") ?: "HelpDesk Pro"

            verifier(JwtConfig.getVerifier())

            validate { credential ->
                credential.payload.getClaim("username")
                    .asString()
                    ?.let { JWTPrincipal(credential.payload) }
            }
        }
    }
}