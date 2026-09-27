package com.eraqi.ticketing

import com.unboundid.asn1.ASN1OctetString
import com.unboundid.ldap.sdk.DN
import com.unboundid.ldap.sdk.LDAPConnection
import com.unboundid.ldap.sdk.LDAPConnectionOptions
import com.unboundid.ldap.sdk.LDAPException
import com.unboundid.ldap.sdk.ResultCode
import com.unboundid.ldap.sdk.SearchRequest
import com.unboundid.ldap.sdk.SearchScope
import com.unboundid.ldap.sdk.controls.SimplePagedResultsControl
import com.unboundid.util.ssl.SSLUtil
import com.unboundid.util.ssl.TrustAllTrustManager
import org.slf4j.LoggerFactory

data class LdapConfig(
    val host: String,
    val port: Int,
    val useSsl: Boolean,
    val bindDn: String,
    val bindPassword: String,
    val baseDn: String,
    val trustAllCertificates: Boolean = false,
    val syncMinutes: Long = 30
)

data class AdUser(
    val guid: String,
    val username: String,
    val displayName: String?,
    val email: String?,
    val department: String?,
    val title: String?,
    val dn: String,
    val enabled: Boolean
)

/**
 * Read-only access to Active Directory.
 * The only operations used are: search (with the service account) and bind (to verify a user's password).
 * Nothing is ever written to AD.
 */
class LdapService(val cfg: LdapConfig) {

    private val log = LoggerFactory.getLogger(LdapService::class.java)

    // Containers in AD that are not departments / real users
    private val excludedContainers = setOf(
        "builtin",
        "computers",
        "domain controllers",
        "foreignsecurityprincipals",
        "managed service accounts",
        "users"
    )

    private fun connect(): LDAPConnection {
        val options = LDAPConnectionOptions().apply {
            connectTimeoutMillis = 10_000
            responseTimeoutMillis = 30_000
        }
        return if (cfg.useSsl) {
            // SSLUtil() with no args uses the JVM default truststore
            val ssl = if (cfg.trustAllCertificates) SSLUtil(TrustAllTrustManager()) else SSLUtil()
            LDAPConnection(ssl.createSSLSocketFactory(), options, cfg.host, cfg.port)
        } else {
            LDAPConnection(options, cfg.host, cfg.port)
        }
    }

    /** Reads all users from AD (paged, so it works with more than 1000 accounts). */
    fun fetchUsers(): List<AdUser> {
        val result = mutableListOf<AdUser>()

        connect().use { conn ->
            conn.bind(cfg.bindDn, cfg.bindPassword)

            val filter = "(&(objectCategory=person)(objectClass=user))"
            val attrs = arrayOf(
                "objectGUID", "sAMAccountName", "displayName", "mail",
                "department", "title", "userAccountControl"
            )

            var cookie: ASN1OctetString? = null
            do {
                val req = SearchRequest(cfg.baseDn, SearchScope.SUB, filter, *attrs)
                req.addControl(SimplePagedResultsControl(500, cookie))
                val res = conn.search(req)

                for (e in res.searchEntries) {
                    val dn = e.dn
                    if (!isSyncable(dn)) continue

                    val guidBytes = e.getAttributeValueBytes("objectGUID") ?: continue
                    val username = e.getAttributeValue("sAMAccountName") ?: continue
                    val uac = e.getAttributeValueAsInteger("userAccountControl") ?: 0

                    result += AdUser(
                        guid = guidToString(guidBytes),
                        username = username,
                        displayName = e.getAttributeValue("displayName"),
                        email = e.getAttributeValue("mail"),
                        // Department = the OU the user sits in; fallback to the "department" attribute
                        department = ouFromDn(dn) ?: e.getAttributeValue("department")?.takeIf { it.isNotBlank() },
                        title = e.getAttributeValue("title"),
                        dn = dn,
                        enabled = (uac and 2) == 0      // bit 2 = ACCOUNTDISABLE
                    )
                }
                cookie = SimplePagedResultsControl.get(res)?.cookie
            } while (cookie != null && cookie.valueLength > 0)
        }

        log.info("AD returned {} users", result.size)
        return result
    }

    /** Verifies the password by binding as the user. Nothing is stored. */
    fun authenticate(userDn: String, password: String): Boolean {
        // An empty password would be treated by LDAP as an anonymous bind (which "succeeds"), so reject it.
        if (password.isBlank()) return false
        return try {
            val connection = connect().use { it.bind(userDn, password) }
            print("connection $connection")
            true
        } catch (e: LDAPException) {
            if (e.resultCode != ResultCode.INVALID_CREDENTIALS) {
                log.warn("LDAP bind problem for {}: {}", userDn, e.message)
            }
            false
        }
    }

    // ── helpers ────────────────────────────────────────────────────

    /** Skips users that live in system containers (Builtin, Computers, Users, ...). */
    /** Skips users that live in system containers (Builtin, Computers, Users, ...). */
    private fun isSyncable(dn: String): Boolean =
        DN(dn).rdNs.drop(1).none { rdn ->
            rdn.getAttributeValues().firstOrNull()?.lowercase() in excludedContainers
        }

    /** Immediate parent OU, e.g. "hr" for CN=ali,OU=hr,DC=batch,DC=local */
    private fun ouFromDn(dn: String): String? =
        DN(dn).rdNs.drop(1)
            .firstOrNull { it.hasAttribute("ou") }
            ?.getAttributeValues()?.firstOrNull()

    /** AD stores objectGUID as 16 bytes in mixed-endian order; this converts to the usual text form. */
    private fun guidToString(b: ByteArray): String {
        fun h(i: Int) = "%02x".format(b[i].toInt() and 0xff)
        return buildString {
            listOf(3, 2, 1, 0).forEach { append(h(it)) }; append('-')
            listOf(5, 4).forEach { append(h(it)) }; append('-')
            listOf(7, 6).forEach { append(h(it)) }; append('-')
            listOf(8, 9).forEach { append(h(it)) }; append('-')
            (10..15).forEach { append(h(it)) }
        }
    }
}
