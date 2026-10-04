# Run once on the support PC using Windows PowerShell 5.1.
# Registers only a per-user helpdesk-vnc: link handler; no administrator rights needed.
$ErrorActionPreference = 'Stop'
$viewerPath = 'C:\Program Files\RealVNC\VNC Viewer\vncviewer.exe'
if (-not (Test-Path -LiteralPath $viewerPath -PathType Leaf)) {
    throw "RealVNC Viewer was not found at $viewerPath. Install it before running this setup."
}
$installDirectory = Join-Path $env:LOCALAPPDATA 'HelpDeskVnc'
New-Item -ItemType Directory -Path $installDirectory -Force | Out-Null
$launcherPath = Join-Path $installDirectory 'HelpDeskVncLauncher.exe'
$source = @'
using System;
using System.Diagnostics;
using System.Net;
using System.Net.Sockets;
using System.Text.RegularExpressions;
using System.Windows.Forms;

public static class HelpDeskVncLauncher {
    [STAThread]
    public static void Main(string[] args) {
        try {
            if (args.Length != 1) throw new Exception("Open a ticket's VNC button in HelpDesk to connect.");
            // Only literal IP addresses. No credentials, ports, commands or options.
            Match match = Regex.Match(args[0], @"\Ahelpdesk-vnc://(?<ip>[0-9.]+|\[[0-9a-fA-F:.]+\])/?\z", RegexOptions.CultureInvariant);
            IPAddress address;
            if (!match.Success || !IPAddress.TryParse(match.Groups["ip"].Value.Trim('[', ']'), out address))
                throw new Exception("The ticket link does not contain a valid IP address.");
            string host = address.AddressFamily == AddressFamily.InterNetworkV6
                ? "[" + address.ToString() + "]" : address.ToString();
            string viewer = @"C:\Program Files\RealVNC\VNC Viewer\vncviewer.exe";
            if (!System.IO.File.Exists(viewer))
                throw new Exception("RealVNC Viewer is not installed at " + viewer);
            Process.Start(new ProcessStartInfo {
                FileName = viewer, Arguments = host, UseShellExecute = false
            });
        } catch (Exception error) {
            MessageBox.Show(error.Message, "HelpDesk VNC", MessageBoxButtons.OK, MessageBoxIcon.Information);
        }
    }
}
'@
# Compile locally so the browser handler does not need PowerShell or script execution.
$tempAssembly = Join-Path $installDirectory ('launcher-' + [Guid]::NewGuid().ToString('N') + '.exe')
try {
    Add-Type -TypeDefinition $source -Language CSharp -ReferencedAssemblies 'System.dll','System.Windows.Forms.dll' -OutputAssembly $tempAssembly -OutputType WindowsApplication
    Move-Item -LiteralPath $tempAssembly -Destination $launcherPath -Force
} finally {
    if (Test-Path -LiteralPath $tempAssembly) { Remove-Item -LiteralPath $tempAssembly }
}
$key = 'HKCU:\Software\Classes\helpdesk-vnc'
New-Item -Path "$key\shell\open\command" -Force | Out-Null
Set-Item -Path $key -Value 'URL:HelpDesk VNC connection'
New-ItemProperty -Path $key -Name 'URL Protocol' -Value '' -PropertyType String -Force | Out-Null
Set-Item -Path "$key\shell\open\command" -Value ('"' + $launcherPath + '" "%1"')
Write-Host 'Setup complete. In the HelpDesk VNC dialog, enable Use Windows launcher, then click Connect with RealVNC.'
Write-Host 'Windows/browser may ask you to allow HelpDeskVncLauncher. RealVNC authentication still applies.'
