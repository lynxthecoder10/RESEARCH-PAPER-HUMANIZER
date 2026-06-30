#!/usr/bin/env python3
"""
Academic Suite — Python Plagiarism Checker
CLI entry point.

Usage:
  python cli.py compare <file_a> <file_b>          Compare two files
  python cli.py scan    <source> <dir/>             Scan source against a directory
  python cli.py text    "<text_a>" "<text_b>"       Compare inline text
  python cli.py export  <file_a> <file_b> <out.txt> Compare and export report
"""

import argparse
import os
import sys

from checker import analyze, analyze_multi
from reporter import print_report, print_multi_report, export_txt_report


# ──────────────────────────────────────────────
#  FILE HELPERS
# ──────────────────────────────────────────────

def read_file(path: str) -> str:
    if not os.path.isfile(path):
        print(f"[ERROR] File not found: {path}")
        sys.exit(1)
    with open(path, "r", encoding="utf-8", errors="ignore") as f:
        return f.read()


def load_directory(dir_path: str) -> list[dict]:
    """Load all .txt, .md, .tex files from a directory as documents."""
    SUPPORTED = (".txt", ".md", ".tex", ".rst", ".csv")
    docs = []
    if not os.path.isdir(dir_path):
        print(f"[ERROR] Directory not found: {dir_path}")
        sys.exit(1)
    for fname in os.listdir(dir_path):
        if fname.lower().endswith(SUPPORTED):
            full = os.path.join(dir_path, fname)
            docs.append({"label": fname, "text": read_file(full)})
    if not docs:
        print(f"[ERROR] No supported files (.txt .md .tex) found in: {dir_path}")
        sys.exit(1)
    return docs


# ──────────────────────────────────────────────
#  COMMANDS
# ──────────────────────────────────────────────

def cmd_compare(args):
    text_a = read_file(args.file_a)
    text_b = read_file(args.file_b)
    result = analyze(text_a, text_b,
                     label_a=os.path.basename(args.file_a),
                     label_b=os.path.basename(args.file_b))
    print_report(result)


def cmd_scan(args):
    source_text = read_file(args.source)
    docs = load_directory(args.directory)
    results = analyze_multi(source_text, docs, source_label=os.path.basename(args.source))
    print_multi_report(results, source_label=os.path.basename(args.source))


def cmd_text(args):
    result = analyze(args.text_a, args.text_b,
                     label_a="Text A",
                     label_b="Text B")
    print_report(result)


def cmd_export(args):
    text_a = read_file(args.file_a)
    text_b = read_file(args.file_b)
    result = analyze(text_a, text_b,
                     label_a=os.path.basename(args.file_a),
                     label_b=os.path.basename(args.file_b))
    print_report(result)
    out = export_txt_report(result, args.output)
    print(f"\n✅ Report saved to: {out}")


# ──────────────────────────────────────────────
#  ARG PARSER
# ──────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        prog="plagiarism_checker",
        description="Academic Suite — Python Plagiarism Checker",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python cli.py compare thesis.txt reference.txt
  python cli.py scan    my_paper.txt ./corpus/
  python cli.py text    "The sky is blue." "The sky appears blue."
  python cli.py export  paper_a.txt paper_b.txt report.txt
        """
    )

    sub = parser.add_subparsers(dest="command", required=True)

    # compare
    p_compare = sub.add_parser("compare", help="Compare two documents")
    p_compare.add_argument("file_a", help="Path to document A")
    p_compare.add_argument("file_b", help="Path to document B")

    # scan
    p_scan = sub.add_parser("scan", help="Scan source against all files in a directory")
    p_scan.add_argument("source",    help="Path to source document")
    p_scan.add_argument("directory", help="Directory containing comparison documents")

    # text
    p_text = sub.add_parser("text", help="Compare two inline text strings")
    p_text.add_argument("text_a", help="First text (use quotes)")
    p_text.add_argument("text_b", help="Second text (use quotes)")

    # export
    p_export = sub.add_parser("export", help="Compare two files and export a report")
    p_export.add_argument("file_a",  help="Path to document A")
    p_export.add_argument("file_b",  help="Path to document B")
    p_export.add_argument("output",  help="Output path for the text report")

    args = parser.parse_args()
    dispatch = {
        "compare": cmd_compare,
        "scan":    cmd_scan,
        "text":    cmd_text,
        "export":  cmd_export,
    }
    dispatch[args.command](args)


if __name__ == "__main__":
    main()
