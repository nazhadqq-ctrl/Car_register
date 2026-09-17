using System;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Threading;
using System.Windows.Forms;

class TrafficCheckApp {
    [STAThread]
    static void Main() {
        try {
            string appDir = AppDomain.CurrentDomain.BaseDirectory;
            Directory.SetCurrentDirectory(appDir);

            // 1. Check if server is already running on port 3000
            bool isRunning = IsServerRunning("http://localhost:3000");

            if (!isRunning) {
                // Find node.exe
                string nodePath = FindNodeExecutable(appDir);
                if (string.IsNullOrEmpty(nodePath)) {
                    MessageBox.Show(
                        "تکایە دڵنیابە لە دابەزاندنی Node.js لەسەر ئەم کۆمپیوتەرە بۆ کارپێکردنی سیستم.\n\nPlease install Node.js to run this application.",
                        "Traffic Inspection System",
                        MessageBoxButtons.OK,
                        MessageBoxIcon.Warning
                    );
                    return;
                }

                // Start node server.js silently in hidden process
                ProcessStartInfo serverPsi = new ProcessStartInfo();
                serverPsi.FileName = nodePath;
                serverPsi.Arguments = "server.js";
                serverPsi.WorkingDirectory = appDir;
                serverPsi.WindowStyle = ProcessWindowStyle.Hidden;
                serverPsi.CreateNoWindow = true;
                serverPsi.UseShellExecute = false;

                Process.Start(serverPsi);

                // Wait up to 10 seconds for server to come online
                for (int i = 0; i < 20; i++) {
                    Thread.Sleep(500);
                    if (IsServerRunning("http://localhost:3000")) {
                        isRunning = true;
                        break;
                    }
                }
            }

            // 2. Find browser (Microsoft Edge or Google Chrome)
            string browserPath = FindBrowserExecutable();
            if (string.IsNullOrEmpty(browserPath)) {
                // Fallback to default system browser
                Process.Start("http://localhost:3000");
                return;
            }

            // 3. Launch as Standalone Desktop App window with silent kiosk printing
            ProcessStartInfo appPsi = new ProcessStartInfo();
            appPsi.FileName = browserPath;
            appPsi.Arguments = "--app=http://localhost:3000 --window-size=1460,860 --kiosk-printing";
            appPsi.WorkingDirectory = appDir;
            appPsi.UseShellExecute = true;

            Process appProcess = Process.Start(appPsi);

        } catch (Exception ex) {
            MessageBox.Show("کێشەیەک ڕوویدا لە کاتی کردنەوەی بەرنامە:\n" + ex.Message, "هەڵە", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }

    static bool IsServerRunning(string url) {
        try {
            HttpWebRequest request = (HttpWebRequest)WebRequest.Create(url);
            request.Timeout = 1200;
            request.Method = "HEAD";
            using (HttpWebResponse response = (HttpWebResponse)request.GetResponse()) {
                return response.StatusCode == HttpStatusCode.OK;
            }
        } catch {
            return false;
        }
    }

    static string FindNodeExecutable(string appDir) {
        // Check local folder
        string local = Path.Combine(appDir, "node.exe");
        if (File.Exists(local)) return local;

        // Check Program Files
        string pf = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "nodejs", "node.exe");
        if (File.Exists(pf)) return pf;

        string pfx86 = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), "nodejs", "node.exe");
        if (File.Exists(pfx86)) return pfx86;

        // Check PATH
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
            string[] lines = output.Split(new char[] { '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries);
            if (lines.Length > 0 && File.Exists(lines[0])) return lines[0];
        } catch { }

        return "node";
    }

    static string FindBrowserExecutable() {
        // Microsoft Edge (Installed on all Windows 10 & 11)
        string[] edgePaths = new string[] {
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), @"Microsoft\Edge\Application\msedge.exe"),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), @"Microsoft\Edge\Application\msedge.exe"),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), @"Microsoft\Edge\Application\msedge.exe")
        };
        foreach (string path in edgePaths) {
            if (File.Exists(path)) return path;
        }

        // Google Chrome
        string[] chromePaths = new string[] {
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), @"Google\Chrome\Application\chrome.exe"),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), @"Google\Chrome\Application\chrome.exe"),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), @"Google\Chrome\Application\chrome.exe")
        };
        foreach (string path in chromePaths) {
            if (File.Exists(path)) return path;
        }

        return null;
    }
}
