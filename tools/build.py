"""Build the local, offline clients with the Windows .NET Framework and Android SDK."""
import argparse
import base64
import json
import os
from pathlib import Path
import re
import secrets
import shutil
import subprocess
import zipfile

ROOT = Path(__file__).resolve().parent.parent
BUILD = ROOT / "build"
DIST = ROOT / "dist"
WEB = ROOT / "web"


def run(command, **kwargs):
    subprocess.run([str(part) for part in command], check=True, **kwargs)


def bundle():
    source = (WEB / "index.html").read_text("utf-8")
    art = base64.b64encode((ROOT / "assets/postcard.jpg").read_bytes()).decode()
    css = (WEB / "style.css").read_text("utf-8").replace("../assets/postcard.jpg", "data:image/jpeg;base64," + art)
    source = source.replace('<link rel="stylesheet" href="style.css">', "<style>\n" + css + "\n</style>")
    pattern = r'<script src="([\w.-]+)"></script>'
    source = re.sub(pattern, lambda m: "<script>\n" + (WEB / m[1]).read_text("utf-8") + "\n</script>", source)
    target = BUILD / "assets/post.html"
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(source, encoding="utf-8")
    ios_target = ROOT / "ios/BirthdayPost/post.html"
    ios_target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(target, ios_target)
    return target


def desktop(page):
    csc = Path(os.environ.get("WINDIR", "C:/Windows")) / "Microsoft.NET/Framework64/v4.0.30319/csc.exe"
    run([csc, "/nologo", "/target:winexe", "/optimize+", "/codepage:65001",
         "/reference:System.Windows.Forms.dll", "/win32icon:" + str(ROOT / "assets/postmark.ico"),
         "/resource:" + str(page) + ",post.html", "/out:" + str(DIST / "生辰邮局-Windows.exe"), ROOT / "desktop/Postal.cs"])


def signing():
    private = ROOT / ".private"
    private.mkdir(exist_ok=True)
    store, secret = private / "birthday-post.p12", private / "store.pass"
    if not store.exists():
        secret.write_text(secrets.token_urlsafe(36), "ascii")
        run(["keytool", "-genkeypair", "-keystore", store, "-storetype", "PKCS12", "-storepass:file", secret,
             "-alias", "birthday-post", "-keyalg", "RSA", "-keysize", "3072", "-validity", "10000",
             "-dname", "CN=Birthday Post, OU=Android"])
    if not secret.exists():
        raise SystemExit("The password file for the existing signing key is missing.")
    return store, secret


def android(sdk):
    if not sdk:
        raise SystemExit("Set ANDROID_SDK_ROOT or pass --sdk.")
    sdk = Path(sdk)
    bt_dirs = [p for p in (sdk / "build-tools").iterdir() if re.fullmatch(r"\d+(\.\d+)*", p.name)]
    bt = max(bt_dirs, key=lambda p: tuple(map(int, p.name.split("."))))
    platforms = [p for p in (sdk / "platforms").glob("android-*") if p.name[8:].isdigit()]
    api = max(platforms, key=lambda p: int(p.name[8:])) / "android.jar"
    java, classes, dex = (BUILD / p for p in ("gen", "classes", "dex"))
    for p in [java, classes, dex]:
        p.mkdir(exist_ok=True)
    compiled, base = BUILD / "resources.zip", BUILD / "base.apk"
    aapt = bt / "aapt2.exe"
    run([aapt, "compile", "--dir", ROOT / "android/res", "-o", compiled])
    run([aapt, "link", "-o", base, "-I", api, "--manifest", ROOT / "android/AndroidManifest.xml",
         "--java", java, "-A", BUILD / "assets", compiled])
    sources = sorted((ROOT / "android/src").rglob("*.java")) + sorted(java.rglob("*.java"))
    run(["javac", "--release", "8", "-encoding", "UTF-8", "-classpath", api, "-d", classes, *sources])
    classes_jar = BUILD / "classes.jar"
    run(["jar", "cf", classes_jar, "-C", classes, "."])
    run([bt / "d8.bat", "--min-api", "26", "--lib", api, "--output", dex, classes_jar])
    with zipfile.ZipFile(base, "a") as apk:
        apk.write(dex / "classes.dex", "classes.dex", compress_type=zipfile.ZIP_DEFLATED)
    aligned = BUILD / "aligned.apk"
    run([bt / "zipalign.exe", "-f", "4", base, aligned])
    store, secret = signing()
    # Keep Java's optional sidecar in the build directory.
    signed = BUILD / "signed.apk"
    signer = bt / "apksigner.bat"
    run([signer, "sign", "--ks", store, "--ks-pass", "file:" + str(secret), "--v4-signing-enabled", "false",
         "--out", signed, aligned])
    run([signer, "verify", "--verbose", signed])
    shutil.copyfile(signed, DIST / "生辰邮局-Android.apk")


def iphone():
    shared = "\n".join((WEB / name).read_text("utf-8") for name in ["lunar-data.js", "core.js"])
    header = "// Variables used by Scriptable.\n// icon-color: red; icon-glyph: birthday-cake;\n"
    script = header + shared + "\n" + (ROOT / "ios/scriptable.js").read_text("utf-8")
    package = {"name": "生辰邮局", "script": script, "icon": {"color": "red", "glyph": "birthday-cake"},
               "share_sheet_inputs": [], "always_run_in_app": True}
    (DIST / "生辰邮局-iPhone.scriptable").write_text(json.dumps(package, ensure_ascii=False), encoding="utf-8")
    alternative = DIST / "iPhone备用安装"
    alternative.mkdir(exist_ok=True)
    (alternative / "生辰邮局.js").write_text(script, encoding="utf-8", newline="\n")


def distribution():
    target = DIST / "生辰邮局-1.0.0.zip"
    files = ["生辰邮局-Windows.exe", "生辰邮局-Android.apk", "生辰邮局-iPhone.scriptable", "iPhone备用安装/生辰邮局.js"]
    with zipfile.ZipFile(target, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for name in files:
            archive.write(DIST / name, name)
        for name in ["LICENSE", "NOTICE", "使用说明.txt", "示例聊天.txt"]:
            archive.write(ROOT / name, name)
        for directory in ["BirthdayPost", "BirthdayPost.xcodeproj"]:
            for path in sorted((ROOT / "ios" / directory).rglob("*")):
                if path.is_file() and "xcuserdata" not in path.parts:
                    archive.write(path, "iOS原生工程/" + path.relative_to(ROOT / "ios").as_posix())
    with zipfile.ZipFile(target) as archive:
        assert archive.testzip() is None


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("targets", nargs="*", default=["desktop","android","iphone"])
    parser.add_argument("--sdk", default=os.environ.get("ANDROID_SDK_ROOT") or os.environ.get("ANDROID_HOME"))
    args = parser.parse_args()
    BUILD.mkdir(exist_ok=True)
    DIST.mkdir(exist_ok=True)
    page = bundle()
    if "desktop" in args.targets:
        desktop(page)
    if "android" in args.targets:
        android(args.sdk)
    if "iphone" in args.targets:
        iphone()
    if "package" in args.targets or {"desktop","android","iphone"}.issubset(args.targets):
        distribution()
