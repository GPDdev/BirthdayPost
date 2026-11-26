"""Exercise the release APK in an isolated Android 36 AVD with the real Documents UI and notifications."""
import argparse
import json
import re
import subprocess
import time
import xml.etree.ElementTree as ET
from datetime import datetime, timezone, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "build/checks"
parser = argparse.ArgumentParser()
parser.add_argument("--adb", required=True)
args = parser.parse_args()
DEVICE = [args.adb, "-s", "emulator-5580"]
PACKAGE = "app.birthdaypost.mobile"


def adb(*cmd):
    return subprocess.check_output([*DEVICE,*cmd], timeout=22).decode("utf-8", errors="replace").strip()


def shell(*cmd):
    return adb("shell",*cmd)


def snapshot(name):
    (OUT / (name + ".png")).write_bytes(subprocess.check_output([*DEVICE,"exec-out","screencap","-p"], timeout=20))


def nodes():
    shell("uiautomator","dump","/sdcard/postal-check.xml")
    return list(ET.fromstring(shell("cat","/sdcard/postal-check.xml")).iter("node"))


def match(words, contains=False, attempts=4):
    if isinstance(words,str):
        words=[words]
    labels=[]
    for _ in range(attempts):
        labels=[]
        for n in nodes():
            values = [n.get("text",""),n.get("content-desc",""),n.get("resource-id","")]
            if values[0] or values[1]:
                labels.append(values[0] or values[1])
            if any(word == val or (contains and word in val) for word in words for val in values):
                bounds=list(map(int,re.findall(r"\d+",n.get("bounds",""))))
                if len(bounds)==4 and bounds[2]>bounds[0] and bounds[3]>bounds[1]:
                    return bounds
    snapshot("android-failure")
    raise AssertionError(f"Could not find {words}. Visible elements: {labels[:60]}")


def tap(words, **kwargs):
    x1,y1,x2,y2=match(words,**kwargs)
    shell("input","tap",str((x1+x2)//2),str((y1+y2)//2))


def launch():
    shell("am","start","-W","-n",PACKAGE+"/.MainActivity")

def set_hour(day, hour, minute=0, second=0):
    actual_zone = shell("date","+%z")
    offset = timedelta(hours=int(actual_zone[1:3]),minutes=int(actual_zone[3:5]))
    zone = timezone(offset if actual_zone[0]=="+" else -offset)
    value = datetime.fromisoformat(day).replace(hour=hour,minute=minute,second=second,tzinfo=zone)
    shell("cmd","alarm","set-time",str(int(value.timestamp()*1000)))


def main():
    assert adb("emu","avd","name").splitlines()[0].strip()=="Postal36", "Tests require the disposable Postal36 AVD."
    OUT.mkdir(parents=True,exist_ok=True)
    pack=OUT/"BirthdayPost-flow.json"
    data=json.loads(pack.read_text("utf-8"))
    now=shell("date","+%F")
    birth=data["people"][0]["birthday"]
    assert (birth["month"],birth["day"])==tuple(map(int,now.split("-")[1:])), "Run windows-flow.cjs for today's fixture first."
    assert shell("pm","clear",PACKAGE)=="Success"
    shell("settings","put","global","auto_time","0")
    set_hour(now,8,40)
    adb("push",str(pack),"/sdcard/Download/BirthdayPost-flow.json")
    shell("am","broadcast","-a","android.intent.action.MEDIA_SCANNER_SCAN_FILE",
          "-d","file:///sdcard/Download/BirthdayPost-flow.json")
    launch()
    tap("传输"); tap("选择生日资料包")
    try:
        tap(["BirthdayPost-flow.json","BirthdayPost-flow"],attempts=1)
    except AssertionError:
        tap(["Show roots","Show navigation drawer","显示根目录","显示导航栏","Open navigation drawer"])
        tap(["Downloads","下载"]); tap(["BirthdayPost-flow.json","BirthdayPost-flow"])
    tap("确认导入"); match("今天有 1 位好友过生日")
    snapshot("android-today")
    tap("写生日祝福"); match("写给阿禾的祝福")
    tap("俏皮"); tap("复制祝福")
    tap("写生日祝福")
    assert any("第一块蛋糕" in n.get("text","") and "骑行" in n.get("text","") for n in nodes())
    tap("关闭"); tap("提醒"); tap("开启生日提醒")
    tap(["Allow","允许","com.android.permissioncontroller:id/permission_allow_button"],attempts=3)
    match("生日提醒已开启")
    assert PACKAGE in shell("dumpsys","alarm")
    # Move just before the scheduled time, then wait for Android to dispatch the actual alarm.
    shell("input","keyevent","KEYCODE_HOME")
    assert PACKAGE+"|21|" not in shell("cmd","notification","list")
    set_hour(now,8,59,55)
    for _ in range(30):
        if PACKAGE+"|21|" in shell("cmd","notification","list"):
            break
        time.sleep(1)
    else:
        raise AssertionError("No system notification after the scheduled time.")
    report=shell("dumpsys","notification","--noredact")
    assert "今天有 1 位好友过生日" in report and "阿禾，点此写祝福" in report
    shell("cmd","statusbar","expand-notifications")
    # Tap the body, which is unique even when other system notifications are present.
    tap("阿禾，点此写祝福",contains=True)
    match("今天有 1 位好友过生日")
    tap("写生日祝福"); match("第一块蛋糕",contains=True)
    print("APK imported the actual PC export via Documents, copied and persisted the personal greeting, scheduled a system alarm, delivered a background birthday notification, and opened today's birthday from it.")


if __name__ == "__main__":
    main()
