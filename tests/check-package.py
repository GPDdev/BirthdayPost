"""Verify the distributable files, embedded UI and Xcode project references."""
import io
import json
from pathlib import Path
import plistlib
import re
from zipfile import ZipFile

root = Path(__file__).resolve().parent.parent
dist = root / "dist"
with ZipFile(dist / "生辰邮局-1.0.0.zip") as package:
    names = package.namelist()
    assert package.testzip() is None
    for name in ["LICENSE", "NOTICE"]:
        assert package.read(name) == (root / name).read_bytes(), name
    for name in ["生辰邮局-Windows.exe", "生辰邮局-Android.apk", "生辰邮局-iPhone.scriptable", "iPhone备用安装/生辰邮局.js"]:
        assert package.read(name) == (dist / name).read_bytes(), name
    assert json.loads(package.read("生辰邮局-iPhone.scriptable"))["script"] == package.read("iPhone备用安装/生辰邮局.js").decode()
    assert not any(n.startswith((".private", "build/")) or n.endswith((".pass", ".p12")) for n in names)
    with ZipFile(io.BytesIO(package.read("生辰邮局-Android.apk"))) as apk:
        html = apk.read("assets/post.html")
    assert html == package.read("iOS原生工程/BirthdayPost/post.html") == (root / "build/assets/post.html").read_bytes()
    assert (dist / "生辰邮局-Windows.exe").read_bytes().count(html) == 1
    info = plistlib.loads(package.read("iOS原生工程/BirthdayPost/Info.plist"))
    assert info["CFBundleDisplayName"] == "生辰邮局"
    project = package.read("iOS原生工程/BirthdayPost.xcodeproj/project.pbxproj").decode()
    definitions = re.findall(r"^\s*([A-F0-9]{24}) =", project, re.M)
    assert len(set(definitions)) == len(definitions) and set(re.findall(r"[A-F0-9]{24}", project)) == set(definitions)
    for resource in ["App.swift", "Assets.xcassets/AppIcon.appiconset/AppIcon.png", "post.html"]:
        assert "iOS原生工程/BirthdayPost/" + resource in names
    print("ZIP CRC and contents, Windows embedded page, matching Android/iOS assets, Scriptable source and Xcode paths passed.")
