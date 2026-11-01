#!/usr/bin/env python3
"""Summarise a ZAP JSON report and exit non-zero on High-risk alerts."""
import json
import sys

RISK = {"3": "High", "2": "Medium", "1": "Low", "0": "Informational"}


def main(path):
    with open(path, encoding="utf-8") as handle:
        report = json.load(handle)
    alerts = [alert for site in report.get("site", []) for alert in site.get("alerts", [])]
    counts = {name: 0 for name in RISK.values()}
    for alert in alerts:
        counts[RISK.get(str(alert.get("riskcode")), "Informational")] += 1

    print("### OWASP ZAP baseline")
    print("| Risk | Alerts |\n|---|---|")
    for name in ("High", "Medium", "Low", "Informational"):
        print(f"| {name} | {counts[name]} |")
    for alert in sorted(alerts, key=lambda a: -int(a.get("riskcode", 0))):
        if int(alert.get("riskcode", 0)) >= 2:
            print(f"- **{RISK[str(alert['riskcode'])]}** {alert.get('name')} (rule {alert.get('pluginid')}, {alert.get('count', '?')} instances)")
    return 1 if counts["High"] else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1]))
