using System;
using System.Drawing;
using System.IO;
using System.Threading;
using System.Windows.Forms;
using System.Diagnostics;

public class SetupWizardForm : Form {
    private int currentStep = 0;
    private Panel headerPanel;
    private Label lblHeaderTitle;
    private Label lblHeaderSub;
    private Panel contentPanel;
    private Panel buttonPanel;
    private Button btnBack;
    private Button btnNext;
    private Button btnCancel;

    // Step Panels
    private Panel panelStep1;
    private Panel panelStep2;
    private Panel panelStep3;
    private Panel panelStep4;
    private Panel panelStep5;

    // Controls
    private TextBox txtInstallPath;
    private CheckBox chkDesktopShortcut;
    private CheckBox chkStartMenuShortcut;
    private CheckBox chkSilentPrint;
    private ProgressBar progressBar;
    private Label lblProgressStatus;
    private CheckBox chkLaunchNow;

    public SetupWizardForm() {
        InitializeComponents();
        ShowStep(0);
    }

    private void InitializeComponents() {
        this.Text = "ویزاردی دابەزاندنی سیستمی پشکنینی هاتووچۆ – Traffic Check Setup";
        this.Size = new Size(680, 490);
        this.StartPosition = FormStartPosition.CenterScreen;
        this.FormBorderStyle = FormBorderStyle.FixedDialog;
        this.MaximizeBox = false;
        this.RightToLeft = RightToLeft.Yes;
        this.RightToLeftLayout = true;
        this.Font = new Font("Segoe UI", 10.5f, FontStyle.Regular);
        this.BackColor = Color.FromArgb(248, 250, 252);

        try {
            if (File.Exists("app.ico")) {
                this.Icon = new Icon("app.ico");
            }
        } catch { }

        // Top Header Banner
        headerPanel = new Panel();
        headerPanel.Dock = DockStyle.Top;
        headerPanel.Height = 82;
        headerPanel.BackColor = Color.FromArgb(26, 58, 107);
        headerPanel.Paint += (s, e) => {
            using (SolidBrush b = new SolidBrush(Color.FromArgb(240, 200, 66))) {
                e.Graphics.FillRectangle(b, 0, headerPanel.Height - 3, headerPanel.Width, 3);
            }
        };

        lblHeaderTitle = new Label();
        lblHeaderTitle.Text = "بەڕێوەبەرایەتی هاتووچۆی پارێزگای سلێمانی – هۆبەی پشکنین";
        lblHeaderTitle.Font = new Font("Segoe UI", 13.5f, FontStyle.Bold);
        lblHeaderTitle.ForeColor = Color.FromArgb(254, 240, 138);
        lblHeaderTitle.Location = new Point(20, 14);
        lblHeaderTitle.AutoSize = true;

        lblHeaderSub = new Label();
        lblHeaderSub.Text = "ویزاردی دابەزاندنی بەرنامەی دێسکتۆپ و پشکنینی ئوتومبێل (Traffic Inspection System)";
        lblHeaderSub.Font = new Font("Segoe UI", 9.5f, FontStyle.Regular);
        lblHeaderSub.ForeColor = Color.FromArgb(226, 232, 240);
        lblHeaderSub.Location = new Point(22, 45);
        lblHeaderSub.AutoSize = true;

        headerPanel.Controls.Add(lblHeaderTitle);
        headerPanel.Controls.Add(lblHeaderSub);

        // Bottom Button Panel
        buttonPanel = new Panel();
        buttonPanel.Dock = DockStyle.Bottom;
        buttonPanel.Height = 58;
        buttonPanel.BackColor = Color.FromArgb(241, 245, 249);
        buttonPanel.Paint += (s, e) => {
            using (Pen p = new Pen(Color.FromArgb(203, 213, 225))) {
                e.Graphics.DrawLine(p, 0, 0, buttonPanel.Width, 0);
            }
        };

        btnNext = new Button();
        btnNext.Text = "دواتر >";
        btnNext.Size = new Size(110, 36);
        btnNext.Location = new Point(20, 11);
        btnNext.BackColor = Color.FromArgb(26, 58, 107);
        btnNext.ForeColor = Color.White;
        btnNext.Font = new Font("Segoe UI", 10f, FontStyle.Bold);
        btnNext.FlatStyle = FlatStyle.Flat;
        btnNext.Click += (s, e) => OnNext();

        btnBack = new Button();
        btnBack.Text = "< پێشتر";
        btnBack.Size = new Size(100, 36);
        btnBack.Location = new Point(140, 11);
        btnBack.BackColor = Color.White;
        btnBack.FlatStyle = FlatStyle.Flat;
        btnBack.Click += (s, e) => OnBack();

        btnCancel = new Button();
        btnCancel.Text = "هەڵوەشاندنەوە";
        btnCancel.Size = new Size(110, 36);
        btnCancel.Location = new Point(540, 11);
        btnCancel.BackColor = Color.White;
        btnCancel.FlatStyle = FlatStyle.Flat;
        btnCancel.Click += (s, e) => {
            if (currentStep == 4 || MessageBox.Show("ئایا دڵنیایت لە هەڵوەشاندنەوەی دابەزاندن؟", "ئاگاداری", MessageBoxButtons.YesNo, MessageBoxIcon.Question) == DialogResult.Yes) {
                this.Close();
            }
        };

        buttonPanel.Controls.Add(btnNext);
        buttonPanel.Controls.Add(btnBack);
        buttonPanel.Controls.Add(btnCancel);

        // Content Panel (Holds wizard steps)
        contentPanel = new Panel();
        contentPanel.Dock = DockStyle.Fill;
        contentPanel.Padding = new Padding(24);

        BuildStep1();
        BuildStep2();
        BuildStep3();
        BuildStep4();
        BuildStep5();

        this.Controls.Add(contentPanel);
        this.Controls.Add(buttonPanel);
        this.Controls.Add(headerPanel);
    }

    // ─── STEP 1: WELCOME ───────────────────────────────────────────────
    private void BuildStep1() {
        panelStep1 = new Panel { Dock = DockStyle.Fill, Visible = false };

        Label title = new Label();
        title.Text = "بەخێربێن بۆ ویزاردی دابەزاندنی سیستمی پشکنین";
        title.Font = new Font("Segoe UI", 13f, FontStyle.Bold);
        title.ForeColor = Color.FromArgb(15, 23, 42);
        title.Location = new Point(10, 15);
        title.AutoSize = true;

        Label desc = new Label();
        desc.Text = "ئەم ویزاردە یارمەتیت دەدات بەرنامەی (سیستمی هۆبەی پشکنینی هاتووچۆ) لەسەر ئەم کۆمپیوتەرە دامەزرێنیت و ئایکۆن لەسەر ڕووی دێسکتۆپ دروست بکات.\n\n" +
                    "تایبەتمەندییە دابەزێنراوەکان:\n" +
                    "  • بەرنامەی تەواوی دێسکتۆپی خێرا و سەربەخۆ (Desktop Application)\n" +
                    "  • چاپی ڕاستەوخۆ بۆ پرنتەر بە بێ کردنەوەی دایالۆگ (Silent Print)\n" +
                    "  • فۆڕمی پشکنینی ستاندارد بە پێوەری هاتووچۆی سلێمانی\n" +
                    "  • ڕێکخستنی ئۆتۆماتیکی سێرڤەر و شۆرتکەتی دێسکتۆپ\n\n" +
                    "تکایە کلیک لەسەر دوگمەی (دواتر >) بکە بۆ دەستپێکردن.";
        desc.Font = new Font("Segoe UI", 10.5f, FontStyle.Regular);
        desc.ForeColor = Color.FromArgb(51, 65, 85);
        desc.Location = new Point(10, 60);
        desc.Size = new Size(610, 220);

        panelStep1.Controls.Add(title);
        panelStep1.Controls.Add(desc);
        contentPanel.Controls.Add(panelStep1);
    }

    // ─── STEP 2: DESTINATION FOLDER ────────────────────────────────────
    private void BuildStep2() {
        panelStep2 = new Panel { Dock = DockStyle.Fill, Visible = false };

        Label title = new Label();
        title.Text = "شوێنی دابەزاندنی بەرنامە دیاری بکە";
        title.Font = new Font("Segoe UI", 12f, FontStyle.Bold);
        title.ForeColor = Color.FromArgb(15, 23, 42);
        title.Location = new Point(10, 15);
        title.AutoSize = true;

        Label desc = new Label();
        desc.Text = "فایلەکانی بەرنامەکە لەم فۆڵدەرەی خوارەوە دادەمەزرێن. دەتوانیت شوێنەکە بگۆڕیت ئەگەر پێت باشە:";
        desc.Location = new Point(10, 50);
        desc.Size = new Size(610, 30);

        txtInstallPath = new TextBox();
        txtInstallPath.Text = @"C:\TrafficCheck";
        txtInstallPath.RightToLeft = RightToLeft.No;
        txtInstallPath.Font = new Font("Segoe UI", 10.5f);
        txtInstallPath.Location = new Point(130, 95);
        txtInstallPath.Size = new Size(490, 30);

        Button btnBrowse = new Button();
        btnBrowse.Text = "گەڕان...";
        btnBrowse.Font = new Font("Segoe UI", 9.5f);
        btnBrowse.Location = new Point(15, 93);
        btnBrowse.Size = new Size(100, 32);
        btnBrowse.BackColor = Color.White;
        btnBrowse.Click += (s, e) => {
            using (FolderBrowserDialog fbd = new FolderBrowserDialog()) {
                fbd.Description = "فۆڵدەری دابەزاندن هەڵبژێرە:";
                if (fbd.ShowDialog() == DialogResult.OK) {
                    txtInstallPath.Text = Path.Combine(fbd.SelectedPath, "TrafficCheck");
                }
            }
        };

        Label spaceLabel = new Label();
        spaceLabel.Text = "پێداویستی قەبارە: نزیکەی 80 مێگابایت لەسەر درایڤی C.";
        spaceLabel.ForeColor = Color.FromArgb(100, 116, 139);
        spaceLabel.Location = new Point(10, 145);
        spaceLabel.AutoSize = true;

        panelStep2.Controls.Add(title);
        panelStep2.Controls.Add(desc);
        panelStep2.Controls.Add(txtInstallPath);
        panelStep2.Controls.Add(btnBrowse);
        panelStep2.Controls.Add(spaceLabel);
        contentPanel.Controls.Add(panelStep2);
    }

    // ─── STEP 3: OPTIONS ───────────────────────────────────────────────
    private void BuildStep3() {
        panelStep3 = new Panel { Dock = DockStyle.Fill, Visible = false };

        Label title = new Label();
        title.Text = "هەڵبژاردنی تایبەتمەندییەکان و شۆرتکەتەکان";
        title.Font = new Font("Segoe UI", 12f, FontStyle.Bold);
        title.Location = new Point(10, 15);
        title.AutoSize = true;

        chkDesktopShortcut = new CheckBox();
        chkDesktopShortcut.Text = "دروستکردنی شۆرتکەتی بەرنامە لەسەر ڕووی دێسکتۆپ (Desktop Shortcut)";
        chkDesktopShortcut.Checked = true;
        chkDesktopShortcut.Font = new Font("Segoe UI", 10.5f, FontStyle.Bold);
        chkDesktopShortcut.Location = new Point(15, 65);
        chkDesktopShortcut.Size = new Size(590, 35);

        chkStartMenuShortcut = new CheckBox();
        chkStartMenuShortcut.Text = "دانانی شۆرتکەت لە مێنیوی دەستپێک (Start Menu)";
        chkStartMenuShortcut.Checked = true;
        chkStartMenuShortcut.Location = new Point(15, 110);
        chkStartMenuShortcut.Size = new Size(590, 35);

        chkSilentPrint = new CheckBox();
        chkSilentPrint.Text = "چالاککردنی چاپی ڕاستەوخۆ بە بێ دایالۆگ (Kiosk Silent Printing)";
        chkSilentPrint.Checked = true;
        chkSilentPrint.Location = new Point(15, 155);
        chkSilentPrint.Size = new Size(590, 35);

        Label tip = new Label();
        tip.Text = "تێبینی: چاپی ڕاستەوخۆ لە ویندۆز ١٠ و ١١ دا وادەکات دەستبەجێ لەگەڵ تۆمارکردن فۆرمەکە لە پرنتەرەوە دەربچێت.";
        tip.ForeColor = Color.FromArgb(71, 85, 105);
        tip.Location = new Point(15, 205);
        tip.Size = new Size(590, 45);

        panelStep3.Controls.Add(title);
        panelStep3.Controls.Add(chkDesktopShortcut);
        panelStep3.Controls.Add(chkStartMenuShortcut);
        panelStep3.Controls.Add(chkSilentPrint);
        panelStep3.Controls.Add(tip);
        contentPanel.Controls.Add(panelStep3);
    }

    // ─── STEP 4: INSTALLING PROGRESS ───────────────────────────────────
    private void BuildStep4() {
        panelStep4 = new Panel { Dock = DockStyle.Fill, Visible = false };

        Label title = new Label();
        title.Text = "دابەزاندنی فایلەکان و جێگیرکردنی سیستەم...";
        title.Font = new Font("Segoe UI", 12f, FontStyle.Bold);
        title.Location = new Point(10, 20);
        title.AutoSize = true;

        lblProgressStatus = new Label();
        lblProgressStatus.Text = "ئامادەکاری دەستپێدەکات...";
        lblProgressStatus.Location = new Point(10, 75);
        lblProgressStatus.Size = new Size(610, 28);

        progressBar = new ProgressBar();
        progressBar.Location = new Point(10, 115);
        progressBar.Size = new Size(610, 30);
        progressBar.Style = ProgressBarStyle.Continuous;

        panelStep4.Controls.Add(title);
        panelStep4.Controls.Add(lblProgressStatus);
        panelStep4.Controls.Add(progressBar);
        contentPanel.Controls.Add(panelStep4);
    }

    // ─── STEP 5: FINISH ────────────────────────────────────────────────
    private void BuildStep5() {
        panelStep5 = new Panel { Dock = DockStyle.Fill, Visible = false };

        Label iconLbl = new Label();
        iconLbl.Text = "✅";
        iconLbl.Font = new Font("Segoe UI", 36f);
        iconLbl.Location = new Point(270, 15);
        iconLbl.Size = new Size(80, 70);

        Label title = new Label();
        title.Text = "دابەزاندنی سیستەم بە سەرکەوتوویی تەواو بوو!";
        title.Font = new Font("Segoe UI", 14f, FontStyle.Bold);
        title.ForeColor = Color.FromArgb(22, 101, 52);
        title.Location = new Point(10, 95);
        title.Size = new Size(610, 35);
        title.TextAlign = ContentAlignment.MiddleCenter;

        Label desc = new Label();
        desc.Text = "سیستمی بەڕێوەبەرایەتی هاتووچۆی سلێمانی (هۆبەی پشکنین) ئامادەیە بۆ بەکارهێنان.\nشۆرتکەت لەسەر دێسکتۆپەکەت دروستکرا.";
        desc.Location = new Point(10, 140);
        desc.Size = new Size(610, 50);
        desc.TextAlign = ContentAlignment.MiddleCenter;

        chkLaunchNow = new CheckBox();
        chkLaunchNow.Text = "ئێستا بەرنامەکە بکەرەوە (Launch TrafficCheck App now)";
        chkLaunchNow.Checked = true;
        chkLaunchNow.Font = new Font("Segoe UI", 11f, FontStyle.Bold);
        chkLaunchNow.Location = new Point(140, 210);
        chkLaunchNow.Size = new Size(420, 35);

        panelStep5.Controls.Add(iconLbl);
        panelStep5.Controls.Add(title);
        panelStep5.Controls.Add(desc);
        panelStep5.Controls.Add(chkLaunchNow);
        contentPanel.Controls.Add(panelStep5);
    }

    private void ShowStep(int step) {
        currentStep = step;
        panelStep1.Visible = (step == 0);
        panelStep2.Visible = (step == 1);
        panelStep3.Visible = (step == 2);
        panelStep4.Visible = (step == 3);
        panelStep5.Visible = (step == 4);

        btnBack.Enabled = (step > 0 && step < 3);

        if (step == 2) {
            btnNext.Text = "دابەزاندن ⬅";
        } else if (step == 3) {
            btnNext.Enabled = false;
            btnBack.Enabled = false;
            btnCancel.Enabled = false;
        } else if (step == 4) {
            btnNext.Text = "تەواوکردن";
            btnNext.Enabled = true;
            btnBack.Visible = false;
            btnCancel.Visible = false;
        } else {
            btnNext.Text = "دواتر >";
            btnNext.Enabled = true;
        }
    }

    private void OnNext() {
        if (currentStep == 0) {
            ShowStep(1);
        } else if (currentStep == 1) {
            string dest = txtInstallPath.Text.Trim();
            if (string.IsNullOrEmpty(dest)) {
                MessageBox.Show("تکایە فۆڵدەرێک دیاری بکە بۆ دابەزاندن.", "ئاگاداری", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return;
            }
            ShowStep(2);
        } else if (currentStep == 2) {
            ShowStep(3);
            StartInstallation();
        } else if (currentStep == 4) {
            if (chkLaunchNow.Checked) {
                string exePath = Path.Combine(txtInstallPath.Text.Trim(), "TrafficCheck.exe");
                if (File.Exists(exePath)) {
                    Process.Start(new ProcessStartInfo(exePath) { WorkingDirectory = txtInstallPath.Text.Trim() });
                }
            }
            this.Close();
        }
    }

    private void OnBack() {
        if (currentStep > 0 && currentStep < 3) {
            ShowStep(currentStep - 1);
        }
    }

    private void StartInstallation() {
        Thread t = new Thread(() => {
            try {
                string sourceDir = AppDomain.CurrentDomain.BaseDirectory;
                string destDir = txtInstallPath.Text.Trim();

                UpdateStatus("دروستکردنی فۆڵدەری مەبەست...", 10);
                if (!Directory.Exists(destDir)) {
                    Directory.CreateDirectory(destDir);
                }

                UpdateStatus("کۆپیکردنی فایلە سەرەکییەکان...", 30);
                string[] filesToCopy = new string[] {
                    "server.js", "db.js", "package.json", "TrafficCheck.exe", "app.ico",
                    "Start_Silent_Print_Edge.bat", "Start_Silent_Print_Chrome.bat"
                };

                foreach (string f in filesToCopy) {
                    string src = Path.Combine(sourceDir, f);
                    if (File.Exists(src)) {
                        File.Copy(src, Path.Combine(destDir, f), true);
                    }
                }

                UpdateStatus("کۆپیکردنی فایلەکانی دیزاین و وێب (public)...", 50);
                string pubSrc = Path.Combine(sourceDir, "public");
                string pubDst = Path.Combine(destDir, "public");
                if (Directory.Exists(pubSrc)) {
                    CopyDirectory(pubSrc, pubDst);
                }

                UpdateStatus("کۆپیکردنی پێداویستییەکان (node_modules)...", 75);
                string nodeSrc = Path.Combine(sourceDir, "node_modules");
                string nodeDst = Path.Combine(destDir, "node_modules");
                if (Directory.Exists(nodeSrc)) {
                    CopyDirectory(nodeSrc, nodeDst);
                }

                UpdateStatus("دروستکردنی شۆرتکەتەکان...", 90);
                string targetExe = Path.Combine(destDir, "TrafficCheck.exe");
                string iconFile = Path.Combine(destDir, "app.ico");

                if (chkDesktopShortcut.Checked) {
                    string desktop = Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory);
                    string lnk = Path.Combine(desktop, "سیستمی پشکنینی هاتووچۆ.lnk");
                    CreateShortcut(lnk, targetExe, destDir, iconFile, "سیستمی پشکنینی ئوتومبێل و شاسی هاتووچۆ");
                }

                if (chkStartMenuShortcut.Checked) {
                    string startMenu = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.StartMenu), "Programs");
                    string lnk = Path.Combine(startMenu, "سیستمی پشکنینی هاتووچۆ.lnk");
                    CreateShortcut(lnk, targetExe, destDir, iconFile, "سیستمی پشکنینی ئوتومبێل و شاسی هاتووچۆ");
                }

                // Create Uninstaller bat
                string uninstaller = Path.Combine(destDir, "Uninstall.bat");
                File.WriteAllText(uninstaller,
                    "@echo off\r\n" +
                    "echo سڕینەوەی شۆرتکەتەکانی بەرنامەی هاتووچۆ...\r\n" +
                    "del /q \"%userprofile%\\Desktop\\سیستمی پشکنینی هاتووچۆ.lnk\" 2>nul\r\n" +
                    "del /q \"%appdata%\\Microsoft\\Windows\\Start Menu\\Programs\\سیستمی پشکنینی هاتووچۆ.lnk\" 2>nul\r\n" +
                    "echo بەرنامەکە سڕایەوە.\r\n" +
                    "pause\r\n",
                    System.Text.Encoding.UTF8
                );

                UpdateStatus("تەواوبوو!", 100);
                Thread.Sleep(600);

                this.Invoke((MethodInvoker)delegate {
                    ShowStep(4);
                });

            } catch (Exception ex) {
                this.Invoke((MethodInvoker)delegate {
                    MessageBox.Show("کێشەیەک ڕوویدا لە کاتی دابەزاندن: " + ex.Message, "هەڵە", MessageBoxButtons.OK, MessageBoxIcon.Error);
                    ShowStep(2);
                });
            }
        });
        t.IsBackground = true;
        t.Start();
    }

    private void UpdateStatus(string text, int progress) {
        if (this.InvokeRequired) {
            this.Invoke((MethodInvoker)delegate {
                lblProgressStatus.Text = text;
                progressBar.Value = Math.Min(100, Math.Max(0, progress));
            });
        } else {
            lblProgressStatus.Text = text;
            progressBar.Value = Math.Min(100, Math.Max(0, progress));
        }
    }

    private static void CopyDirectory(string sourceDir, string destinationDir) {
        Directory.CreateDirectory(destinationDir);
        foreach (string file in Directory.GetFiles(sourceDir)) {
            string targetFilePath = Path.Combine(destinationDir, Path.GetFileName(file));
            File.Copy(file, targetFilePath, true);
        }
        foreach (string subDir in Directory.GetDirectories(sourceDir)) {
            string targetSubDir = Path.Combine(destinationDir, Path.GetFileName(subDir));
            CopyDirectory(subDir, targetSubDir);
        }
    }

    private static void CreateShortcut(string shortcutPath, string targetPath, string workingDir, string iconPath, string description) {
        try {
            Type shellType = Type.GetTypeFromProgID("WScript.Shell");
            if (shellType != null) {
                object shell = Activator.CreateInstance(shellType);
                object shortcut = shellType.InvokeMember("CreateShortcut", System.Reflection.BindingFlags.InvokeMethod, null, shell, new object[] { shortcutPath });
                if (shortcut != null) {
                    Type scType = shortcut.GetType();
                    scType.InvokeMember("TargetPath", System.Reflection.BindingFlags.SetProperty, null, shortcut, new object[] { targetPath });
                    scType.InvokeMember("WorkingDirectory", System.Reflection.BindingFlags.SetProperty, null, shortcut, new object[] { workingDir });
                    scType.InvokeMember("Description", System.Reflection.BindingFlags.SetProperty, null, shortcut, new object[] { description });
                    if (File.Exists(iconPath)) {
                        scType.InvokeMember("IconLocation", System.Reflection.BindingFlags.SetProperty, null, shortcut, new object[] { iconPath });
                    }
                    scType.InvokeMember("Save", System.Reflection.BindingFlags.InvokeMethod, null, shortcut, null);
                }
            }
        } catch { }
    }

    [STAThread]
    static void Main() {
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        Application.Run(new SetupWizardForm());
    }
}
