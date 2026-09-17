using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.IO;

class MakeIcon {
    static void Main() {
        using (Bitmap bmp = new Bitmap(64, 64)) {
            using (Graphics g = Graphics.FromImage(bmp)) {
                g.SmoothingMode = SmoothingMode.AntiAlias;

                // Navy circle background
                using (SolidBrush bg = new SolidBrush(Color.FromArgb(26, 58, 107))) {
                    g.FillEllipse(bg, 2, 2, 60, 60);
                }
                // Gold ring
                using (Pen gold = new Pen(Color.FromArgb(240, 200, 66), 3f)) {
                    g.DrawEllipse(gold, 3, 3, 58, 58);
                }
                // Traffic light box
                using (SolidBrush box = new SolidBrush(Color.FromArgb(13, 27, 53))) {
                    g.FillRectangle(box, 23, 10, 18, 44);
                }
                using (Pen boxPen = new Pen(Color.FromArgb(200, 168, 75), 1.5f)) {
                    g.DrawRectangle(boxPen, 23, 10, 18, 44);
                }
                // Red, Yellow, Green lights
                using (SolidBrush red = new SolidBrush(Color.FromArgb(239, 68, 68))) {
                    g.FillEllipse(red, 26, 13, 12, 12);
                }
                using (SolidBrush yellow = new SolidBrush(Color.FromArgb(245, 158, 11))) {
                    g.FillEllipse(yellow, 26, 26, 12, 12);
                }
                using (SolidBrush green = new SolidBrush(Color.FromArgb(16, 185, 129))) {
                    g.FillEllipse(green, 26, 39, 12, 12);
                }
            }

            IntPtr hIcon = bmp.GetHicon();
            using (Icon icon = Icon.FromHandle(hIcon)) {
                using (FileStream fs = new FileStream("app.ico", FileMode.Create)) {
                    icon.Save(fs);
                }
            }
        }
        Console.WriteLine("app.ico generated successfully!");
    }
}
