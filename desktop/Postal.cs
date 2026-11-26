using System;
using System.Diagnostics;
using System.IO;
using System.Reflection;
using System.Security.Cryptography;
using System.Windows.Forms;

[assembly: AssemblyTitle("生辰邮局")]
[assembly: AssemblyProduct("生辰邮局")]
[assembly: AssemblyVersion("1.0.0.0")]

internal static class Postal
{
    [STAThread]
    private static void Main()
    {
        try
        {
            string local = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
            string app = Path.Combine(local, "BirthdayPost");
            Directory.CreateDirectory(app);
            string page = Path.Combine(app, "post.html");
            using (Stream resource = Assembly.GetExecutingAssembly().GetManifestResourceStream("post.html"))
            using (SHA256 hash = SHA256.Create())
            {
                byte[] desired = hash.ComputeHash(resource);
                bool current = false;
                if (File.Exists(page))
                {
                    using (FileStream input = File.OpenRead(page))
                        current = Convert.ToBase64String(hash.ComputeHash(input)) == Convert.ToBase64String(desired);
                }
                if (!current)
                {
                    resource.Position = 0;
                    string temp = Path.Combine(app, Guid.NewGuid().ToString("N") + ".tmp");
                    using (FileStream output = File.Create(temp)) resource.CopyTo(output);
                    if (File.Exists(page)) File.Replace(temp, page, null);
                    else File.Move(temp, page);
                }
            }
            string[] roots = {
                Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86),
                Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), local
            };
            foreach (string root in roots)
            {
                string edge = Path.Combine(root, @"Microsoft\Edge\Application\msedge.exe");
                if (!File.Exists(edge)) continue;
                ProcessStartInfo start = new ProcessStartInfo(edge);
                start.UseShellExecute = false;
                start.Arguments = "--no-first-run --disable-sync --user-data-dir=\"" + Path.Combine(app, "Browser") +
                    "\" --app=\"" + new Uri(page).AbsoluteUri + "\"";
                Process.Start(start);
                return;
            }
            MessageBox.Show("请安装 Microsoft Edge 后重新打开生辰邮局。", "生辰邮局");
        }
        catch (Exception e)
        {
            MessageBox.Show("生辰邮局未能启动。\n" + e.Message, "生辰邮局", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }
}
