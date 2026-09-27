package com.eraqi.ticketing

import io.ktor.server.application.Application
import io.ktor.server.application.log
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * Reads the "ldap" block of application.yaml, builds the LdapService, stores it in
 * DatabaseFactory.ldap (so AuthRoutes.kt can use it for login), runs a first sync
 * immediately, then repeats it every ldap.syncMinutes minutes.
 *
 * Call this once from Application.module(), after DatabaseFactory.init(config).
 */
fun Application.setupAd() {
    val c = environment.config

    val cfg = LdapConfig(
        host = c.property("ldap.host").getString(),
        port = c.property("ldap.port").getString().toInt(),
        useSsl = c.property("ldap.useSsl").getString().toBoolean(),
        bindDn = c.property("ldap.bindDn").getString(),
        bindPassword = c.property("ldap.bindPassword").getString(),
        baseDn = c.property("ldap.baseDn").getString(),
        trustAllCertificates = c.propertyOrNull("ldap.trustAllCertificates")?.getString()?.toBoolean() ?: false,
        syncMinutes = c.propertyOrNull("ldap.syncMinutes")?.getString()?.toLong() ?: 30
    )

    val ldap = LdapService(cfg)
    DatabaseFactory.ldap = ldap

    launch {
        while (isActive) {
            try {
                // LDAP calls are blocking, so run them off the event loop
                withContext(Dispatchers.IO) { syncUsers(ldap, DatabaseFactory.db) }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                log.error("AD sync failed: ${e.message}", e)
            }
            delay(cfg.syncMinutes * 60_000L)
        }
    }
}
