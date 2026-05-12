package com.helpdesk.utils

import com.auth0.jwt.JWT
import com.auth0.jwt.algorithms.Algorithm
import com.helpdesk.models.User
import io.ktor.server.application.*
import io.ktor.server.auth.jwt.*
import io.ktor.server.config.tryGetString
import java.util.*

object JwtConfig {
    private lateinit var secret: String
    private lateinit var issuer: String
    private lateinit var audience: String
    private var expirationHours: Long = 24

    fun init(config: io.ktor.server.config.ApplicationConfig) {
        secret          = config.tryGetString("jwt.secret")           ?: "default-secret"
        issuer          = config.tryGetString("jwt.issuer")           ?: "helpdesk"
        audience        = config.tryGetString("jwt.audience")         ?: "helpdesk-users"
        expirationHours = config.tryGetString("jwt.expirationHours")?.toLong() ?: 24L
    }

    fun generateToken(user: User): String = JWT.create()
        .withIssuer(issuer)
        .withAudience(audience)
        .withClaim("userId",   user.id.toHexString())
        .withClaim("username", user.username)
        .withClaim("name",     user.name)
        .withClaim("role",     user.role)
        .withExpiresAt(Date(System.currentTimeMillis() + expirationHours * 3_600_000))
        .sign(Algorithm.HMAC256(secret))

    fun getVerifier() = JWT.require(Algorithm.HMAC256(secret))
        .withIssuer(issuer)
        .withAudience(audience)
        .build()

    fun getSecret()   = secret
    fun getIssuer()   = issuer
    fun getAudience() = audience
}

// Helper extension to get username from JWT principal
fun JWTPrincipal.username(): String = payload.getClaim("username").asString() ?: ""
fun JWTPrincipal.name(): String     = payload.getClaim("name").asString() ?: ""
fun JWTPrincipal.role(): String     = payload.getClaim("role").asString() ?: ""
fun JWTPrincipal.userId(): String   = payload.getClaim("userId").asString() ?: ""
