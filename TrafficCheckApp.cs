using System;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Threading;
using System.Windows.Forms;

public class TrafficCheckApp {
    [STAThread]
    public static void Main() {
        try {
            string appDir = AppDomain.CurrentDomain.BaseDirectory;
            Directory.SetCurrentDirectory(appDir);

            string url = "http://localhost:3000";

            if (!IsServerRunning(url)) {
                string nodeExe = FindNodeExecutable(appDir);
                if (string.IsNullOrEmpty(nodeExe)) {
                    MessageBox.Show(
                        "تکایە دڵنیابە لە دابەزاندنی Node.js لەسەر ئەم کۆمپیوتەرە بۆ کارپێکردنی سیستم.\n\nPlease install Node.js to run this application.",
                        "Traffic Inspection System",
                        MessageBoxButtons.OK,
                        MessageBoxIcon.Error
                    );
                    return;
                }

                ProcessStartInfo psi = new ProcessStartInfo();
                psi.FileName = nodeExe;
                psi.Arguments = "server.js";
                psi.WorkingDirectory = appDir;
                psi.WindowStyle = ProcessWindowStyle.Hidden;
                psi.CreateNoWindow = true;
                psi.UseShellExecute = false;
                Process.Start(psi);

                for (int i = 0; i < 20; i++) {
                    Thread.Sleep(500);
                    if (IsServerRunning(url)) break;
                }
            }

            string browser = FindBrowserExecutable();
            string kioskDir = Path.Combine(appDir, "KioskProfile");
            if (!Directory.Exists(kioskDir)) {
                try { Directory.CreateDirectory(kioskDir); } catch {}
            }

            if (string.IsNullOrEmpty(browser)) {
                Process.Start("http://localhost:3000/login.html");
            } else {
                ProcessStartInfo bPsi = new ProcessStartInfo();
                bPsi.FileName = browser;
                // Running with an isolated profile guarantees --kiosk-printing works even when Edge/Chrome is already open!
                bPsi.Arguments = string.Format(
                    "--user-data-dir=\"{0}\" --kiosk-printing --app=http://localhost:3000/login.html --window-size=1460,860",
                    kioskDir
                );
                bPsi.WorkingDirectory = appDir;
                bPsi.UseShellExecute = true;
                Process.Start(bPsi);
            }
        } catch (Exception ex) {
            MessageBox.Show("کێشەیەک ڕوویدا لە کاتی کردنەوەی بەرنامە:\n" + ex.Message, "هەڵە", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }

    private static bool IsServerRunning(string url) {
        try {
            HttpWebRequest req = (HttpWebRequest)WebRequest.Create(url);
            req.Timeout = 1500;
            req.Method = "HEAD";
            using (HttpWebResponse res = (HttpWebResponse)req.GetResponse()) {
                return (int)res.StatusCode > 0;
            }
        } catch {
            return false;
        }
    }

    private static string FindNodeExecutable(string appDir) {
        string localNode = Path.Combine(appDir, "node.exe");
        if (File.Exists(localNode)) return localNode;

        string pf = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "nodejs", "node.exe");
        if (File.Exists(pf)) return pf;

        string pfx86 = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), "nodejs", "node.exe");
        if (File.Exists(pfx86)) return pfx86;

        try {
            Process p = new Process();
            p.StartInfo.FileName = "where.exe";
            p.StartInfo.Arguments = "node";
            p.StartInfo.UseShellExecute = false;
            p.StartInfo.RedirectStandardOutput = true;
            p.StartInfo.CreateNoWindow = true;
            p.Start();
            string output = p.StandardOutput.ReadToEnd();
            p.WaitForExit();
            if (!string.IsNullOrEmpty(output)) {
                string[] lines = output.Split(new char[] { '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries);
                if (lines.Length > 0 && File.Exists(lines[0].Trim())) return lines[0].Trim();
            }
        } catch {}

        return "node";
    }

    private static string FindBrowserExecutable() {
        string[] edgePaths = new string[] {
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), @"Microsoft\Edge\Application\msedge.exe"),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), @"Microsoft\Edge\Application\msedge.exe"),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), @"Microsoft\Edge\Application\msedge.exe")
        };
        foreach (string ep in edgePaths) {
            if (File.Exists(ep)) return ep;
        }

        string[] chromePaths = new string[] {
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), @"Google\Chrome\Application\chrome.exe"),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), @"Google\Chrome\Application\chrome.exe"),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), @"Google\Chrome\Application\chrome.exe")
        };
        foreach (string cp in chromePaths) {
            if (File.Exists(cp)) return cp;
        }

        return string.Empty;
    }
}
