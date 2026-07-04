#!/usr/bin/env python3
"""
Academic Suite — Python Plagiarism Checker (Production Architecture)
CLI entry point.

COMMANDS:
  scan     <file>              Full production scan (cache-first + API)
  compare  <file_a> <file_b>  Local pairwise comparison (no API/DB)
  text     "<a>" "<b>"        Compare two inline text strings
  export   <file_a> <file_b>  Compare and save text report
  history                     Show recent scan history
  stats                       Show database statistics

SETUP:
  pip install -r requirements.txt
  # For PDF support: pip install pdfplumber
  # For DOCX support: pip install python-docx
"""

import argparse
import os
import sys
import json

# ──────────────────────────────────────────────
#  WINDOWS UTF-8 FIX
# ──────────────────────────────────────────────
if sys.platform == "win32":
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

try:
    from rich.console import Console
    from rich.table   import Table
    from rich.panel   import Panel
    from rich.text    import Text
    from rich         import box
    HAS_RICH = True
except ImportError:
    HAS_RICH = False

console = Console(force_terminal=True, highlight=False) if HAS_RICH else None


# ──────────────────────────────────────────────
#  SCAN REPORT RENDERER
# ──────────────────────────────────────────────

def _risk_color(score: float) -> str:
    if score >= 75: return "red"
    if score >= 45: return "yellow"
    if score >= 20: return "cyan"
    return "green"

def _risk_badge(score: float) -> str:
    if score >= 75: return "[!!] HIGH"
    if score >= 45: return "[! ] MEDIUM"
    if score >= 20: return "[~  ] LOW"
    return "[OK] NONE"

def _cache_label(hit: str) -> str:
    return {"hash": "[INSTANT] Hash Cache", "keyword": "[FAST] Keyword Cache", "miss": "[API] Live Search"}.get(hit, hit)


def print_scan_report(result: dict):
    sim   = result.get("similarity", 0) or 0
    orig  = result.get("originality", 100) or 100
    ai    = result.get("ai_score", 0) or 0
    color = _risk_color(sim)
    badge = _risk_badge(sim)
    cache = _cache_label(result.get("cache_hit", "miss"))

    if HAS_RICH:
        console.rule("[bold white]ACADEMIC INTEGRITY REPORT[/bold white]")

        # Header
        kw_str = ", ".join((result.get("keywords") or [])[:6])
        info = (
            f"[bold]File:[/bold]       {result.get('filename', 'N/A')}\n"
            f"[bold]Scan ID:[/bold]    {result.get('scan_id', 'N/A')}\n"
            f"[bold]Cache:[/bold]      {cache}\n"
            f"[bold]Time:[/bold]       {result.get('elapsed_seconds', '?')}s\n"
            f"[bold]Keywords:[/bold]   {kw_str}"
        )
        console.print(Panel(info, title="[cyan]Scan Info[/cyan]", border_style="cyan"))
        console.print()

        # Score summary
        bar_s = "=" * int(sim / 5) + "-" * (20 - int(sim / 5))
        bar_o = "=" * int(orig / 5) + "-" * (20 - int(orig / 5))
        summary = (
            f"  [{color}]{badge}[/{color}]\n\n"
            f"  Similarity:   [{color}][bold]{sim}%[/bold][/{color}]   {bar_s}\n"
            f"  Originality:  [green][bold]{orig}%[/bold][/green]   {bar_o}\n"
            f"  AI Content:   [yellow]{ai}%[/yellow]   (heuristic estimate)"
        )
        console.print(Panel(summary, title="[bold]Scores[/bold]", border_style=color))
        console.print()

        # Matched papers table
        matches = result.get("matches") or []
        if matches:
            table = Table(title=f"Top Matched Papers ({result.get('total_matches', 0)} total)",
                          box=box.ROUNDED, border_style="bright_black")
            table.add_column("Rank",       justify="center", style="dim")
            table.add_column("Title",      style="white",    max_width=45)
            table.add_column("Score",      justify="right")
            table.add_column("Year",       justify="center", style="dim")
            table.add_column("Source",     justify="center", style="dim")
            table.add_column("DOI",        style="dim",      max_width=30)

            for i, m in enumerate(matches[:8], 1):
                sc   = m.get("similarity", 0)
                col  = _risk_color(sc)
                sc_t = Text(f"{sc}%", style=f"bold {col}")
                title = m.get("_title") or m.get("title", "")
                doi   = m.get("_doi")   or m.get("doi", "") or ""
                year  = str(m.get("_year") or m.get("year", "") or "")
                src   = m.get("_source") or m.get("source", "")
                table.add_row(str(i), title[:45], sc_t, year, src, doi[:30])

            console.print(table)
            console.print()

            # Show matched paragraphs
            para_shown = False
            for m in matches[:3]:
                para = m.get("paragraph", "")
                if para:
                    if not para_shown:
                        console.print("[bold yellow]Matched Passages:[/bold yellow]")
                        para_shown = True
                    title = m.get("_title") or m.get("title", "N/A")
                    console.print(f"\n  [cyan]{title[:60]}[/cyan]")
                    console.print(f"  [dim]{para[:300]}...[/dim]")
        else:
            console.print(Panel("[green][OK] No significant matches found in external sources.[/green]",
                                border_style="green"))

        console.print()
        console.rule("[dim]End of Report[/dim]")
    else:
        # Plain fallback
        print(f"\n{'='*60}")
        print("ACADEMIC INTEGRITY REPORT")
        print(f"{'='*60}")
        print(f"File:        {result.get('filename')}")
        print(f"Similarity:  {sim}%")
        print(f"Originality: {orig}%")
        print(f"AI Score:    {ai}%")
        print(f"Cache:       {cache}")
        for i, m in enumerate(result.get("matches", [])[:5], 1):
            print(f"\n  [{i}] {m.get('_title','N/A')} ({m.get('similarity')}%)")
        print("="*60)


# ──────────────────────────────────────────────
#  COMMANDS
# ──────────────────────────────────────────────

def cmd_scan(args):
    """Full production scan with cache-first + API fallback."""
    from scanner import scan_document
    if HAS_RICH:
        console.print(f"\n[bold cyan]Scanning:[/bold cyan] {args.file}\n")
    result = scan_document(filepath=args.file, verbose=True)
    print_scan_report(result)


def cmd_compare(args):
    """Local pairwise comparison using existing 4-algorithm engine."""
    from checker  import analyze
    from reporter import print_report
    def read(p):
        if not os.path.isfile(p): print(f"Not found: {p}"); sys.exit(1)
        with open(p, encoding="utf-8", errors="ignore") as f: return f.read()
    result = analyze(read(args.file_a), read(args.file_b),
                     os.path.basename(args.file_a), os.path.basename(args.file_b))
    print_report(result)


def cmd_text(args):
    from checker  import analyze
    from reporter import print_report
    result = analyze(args.text_a, args.text_b, "Text A", "Text B")
    print_report(result)


def cmd_export(args):
    from checker  import analyze
    from reporter import print_report, export_txt_report
    def read(p):
        with open(p, encoding="utf-8", errors="ignore") as f: return f.read()
    result = analyze(read(args.file_a), read(args.file_b),
                     os.path.basename(args.file_a), os.path.basename(args.file_b))
    print_report(result)
    out = export_txt_report(result, args.output)
    if HAS_RICH:
        console.print(f"\n[green]Report saved:[/green] {out}")
    else:
        print(f"\nReport saved: {out}")


def cmd_history(args):
    from db import get_scan_history, init_db
    init_db()
    rows = get_scan_history(limit=args.limit)
    if not rows:
        print("No scan history found.")
        return
    if HAS_RICH:
        table = Table(title="Scan History", box=box.ROUNDED, border_style="bright_black")
        table.add_column("Date",        style="dim")
        table.add_column("File",        style="white")
        table.add_column("Similarity",  justify="right")
        table.add_column("Originality", justify="right")
        table.add_column("Cache",       justify="center", style="cyan")
        for r in rows:
            sim   = r.get("similarity") or 0
            col   = _risk_color(sim)
            sim_t = Text(f"{sim}%", style=f"bold {col}")
            table.add_row(
                str(r.get("created_at", ""))[:16],
                str(r.get("filename", ""))[:35],
                sim_t,
                f"{r.get('originality', 0)}%",
                _cache_label(r.get("cache_hit", ""))
            )
        console.print(table)
    else:
        for r in rows:
            print(f"{r['created_at'][:16]} | {r['filename']} | {r['similarity']}%")


def cmd_stats(args):
    from db import db_stats, init_db
    init_db()
    s = db_stats()
    if HAS_RICH:
        console.print(Panel(
            f"  [bold]Cached Papers:[/bold]  {s['cached_papers']}\n"
            f"  [bold]Total Scans:[/bold]    {s['total_scans']}\n"
            f"  [bold]Total Matches:[/bold]  {s['total_matches']}",
            title="[cyan]Database Statistics[/cyan]", border_style="cyan"
        ))
    else:
        print(json.dumps(s, indent=2))


# ──────────────────────────────────────────────
#  ARG PARSER
# ──────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        prog="plagiarism_checker",
        description="Academic Suite — Production Plagiarism Checker",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python cli.py scan     my_paper.txt
  python cli.py scan     thesis.pdf
  python cli.py compare  paper_a.txt paper_b.txt
  python cli.py text     "The sky is blue" "The sky appears blue"
  python cli.py export   doc_a.txt doc_b.txt report.txt
  python cli.py history  --limit 10
  python cli.py stats
        """
    )
    sub = parser.add_subparsers(dest="command", required=True)

    p_scan = sub.add_parser("scan", help="Full scan with cache-first + API")
    p_scan.add_argument("file", help="Path to document (PDF/DOCX/TXT)")

    p_cmp = sub.add_parser("compare", help="Local 4-algorithm comparison")
    p_cmp.add_argument("file_a")
    p_cmp.add_argument("file_b")

    p_txt = sub.add_parser("text", help="Compare two text strings")
    p_txt.add_argument("text_a")
    p_txt.add_argument("text_b")

    p_exp = sub.add_parser("export", help="Compare and export report")
    p_exp.add_argument("file_a")
    p_exp.add_argument("file_b")
    p_exp.add_argument("output")

    p_hist = sub.add_parser("history", help="View recent scans")
    p_hist.add_argument("--limit", type=int, default=15)

    sub.add_parser("stats", help="Database statistics")

    args = parser.parse_args()
    {
        "scan":    cmd_scan,
        "compare": cmd_compare,
        "text":    cmd_text,
        "export":  cmd_export,
        "history": cmd_history,
        "stats":   cmd_stats,
    }[args.command](args)


if __name__ == "__main__":
    main()
