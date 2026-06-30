"""
Academic Suite — Plagiarism Checker
Rich terminal report renderer.
"""

import sys
import datetime

try:
    from rich.console import Console
    from rich.table import Table
    from rich.panel import Panel
    from rich import box
    HAS_RICH = True
except ImportError:
    HAS_RICH = False

# Force UTF-8 output on Windows to avoid cp1252 emoji errors
if sys.platform == "win32":
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

console = Console(force_terminal=True, highlight=False) if HAS_RICH else None


def _risk_color(risk: str) -> str:
    return {"HIGH": "red", "MEDIUM": "yellow", "LOW": "cyan", "NONE": "green"}.get(risk, "white")


def _risk_badge(risk: str) -> str:
    return {"HIGH": "[!!]", "MEDIUM": "[! ]", "LOW": "[~ ]", "NONE": "[OK]"}.get(risk, "[ ]")


def print_report(result: dict):
    """Print a single pairwise comparison report."""
    if not HAS_RICH:
        _plain_report(result)
        return

    risk    = result["risk_level"]
    color   = _risk_color(risk)
    badge   = _risk_badge(risk)
    score   = result["composite_score"]

    console.rule(f"[bold white]PLAGIARISM ANALYSIS REPORT[/bold white]")
    console.print()

    # Header panel
    header = (
        f"[bold]Source:[/bold]  {result['label_a']}\n"
        f"[bold]Compared:[/bold] {result['label_b']}\n"
        f"[bold]Words (A):[/bold] {result['word_count_a']}   "
        f"[bold]Words (B):[/bold] {result['word_count_b']}\n"
        f"[bold]Timestamp:[/bold] {datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')}"
    )
    console.print(Panel(header, title="[bold cyan]Document Info[/bold cyan]", border_style="cyan"))
    console.print()

    # Composite score
    bar = "=" * int(score / 5) + "-" * (20 - int(score / 5))
    console.print(
        Panel(
            f"  [{color}]{badge} {risk} RISK[/{color}]\n\n"
            f"  Composite Plagiarism Score: [{color}][bold]{score}%[/bold][/{color}]\n\n"
            f"  [{color}]{bar}[/{color}]  {score}%",
            title="[bold]Overall Result[/bold]",
            border_style=color,
        )
    )
    console.print()

    # Algorithm breakdown table
    from rich.text import Text
    table = Table(title="Algorithm Breakdown", box=box.ROUNDED, border_style="bright_black")
    table.add_column("Algorithm",         style="bold white", no_wrap=True)
    table.add_column("Score",             justify="right")
    table.add_column("Weight",            justify="center")
    table.add_column("Visual",            no_wrap=True)

    algo_meta = [
        ("TF-IDF Cosine",       result["scores"]["tfidf_cosine"],   "35%"),
        ("N-Gram Jaccard",      result["scores"]["ngram_jaccard"],  "30%"),
        ("Sequence Match",      result["scores"]["sequence_match"], "20%"),
        ("Winnowing / Hash FP", result["scores"]["winnowing"],      "15%"),
    ]

    for name, sc, weight in algo_meta:
        col = "red" if sc >= 75 else "yellow" if sc >= 45 else "cyan" if sc >= 20 else "green"
        filled = int(sc / 10)
        bar_text = Text()
        bar_text.append("=" * filled, style=col)
        bar_text.append("-" * (10 - filled))
        score_text = Text(f"{sc}%", style=f"bold {col}")
        table.add_row(name, score_text, weight, bar_text)

    console.print(table)
    console.print()

    # Matching passages
    passages = result.get("matching_passages", [])
    if passages:
        console.print(Panel(
            f"[yellow][WARN] {len(passages)} suspicious sentence(s) detected[/yellow]",
            title="[bold yellow]Matching Passages[/bold yellow]",
            border_style="yellow"
        ))
        for i, p in enumerate(passages[:8], 1):  # show max 8
            console.print(f"\n[bold cyan]  Match #{i}  ({p['similarity']}% similar)[/bold cyan]")
            console.print(f"  [bold]Source:[/bold]  [italic]{p['source_sentence'][:200]}[/italic]")
            console.print(f"  [bold]Matched:[/bold] [italic]{p['matched_sentence'][:200]}[/italic]")
        if len(passages) > 8:
            console.print(f"\n  [dim]... and {len(passages) - 8} more matches not shown[/dim]")
    else:
        console.print(Panel("[green][OK] No suspicious sentence-level matches found.[/green]",
                            border_style="green"))

    console.print()
    console.rule("[dim]End of Report[/dim]")


def print_multi_report(results: list[dict], source_label: str):
    """Print a ranked comparison report when checking against multiple documents."""
    if not HAS_RICH:
        for r in results:
            _plain_report(r)
        return

    console.rule(f"[bold white]MULTI-DOCUMENT PLAGIARISM SCAN[/bold white]")
    console.print(f"\n[bold cyan]Source:[/bold cyan] {source_label}\n")

    table = Table(title="Ranked Results", box=box.ROUNDED, border_style="bright_black")
    table.add_column("Rank",      justify="center", style="dim")
    table.add_column("Document",  style="bold white")
    table.add_column("Score",     justify="right",  style="bold")
    table.add_column("Risk",      justify="center")
    table.add_column("Bar",       no_wrap=True)

    for i, r in enumerate(results, 1):
        risk  = r["risk_level"]
        score = r["composite_score"]
        color = _risk_color(risk)
        badge = _risk_badge(risk)
        bar   = f"[{color}]" + "#" * int(score / 5) + "[/{color}]" + "-" * (20 - int(score / 5))
        table.add_row(str(i), r["label_b"], f"[{color}]{score}%[/{color}]",
                      f"[{color}]{badge} {risk}[/{color}]", bar)

    console.print(table)
    console.print()

    # Show full details for the highest-risk match
    if results and results[0]["composite_score"] > 20:
        console.print("[bold yellow]→ Full detail for highest-risk match:[/bold yellow]\n")
        print_report(results[0])


def _plain_report(result: dict):
    """Fallback plain-text report when rich is not installed."""
    print("\n" + "=" * 60)
    print("PLAGIARISM REPORT")
    print("=" * 60)
    print(f"Source:    {result['label_a']}")
    print(f"Compared:  {result['label_b']}")
    print(f"Risk:      {result['risk_level']}")
    print(f"Score:     {result['composite_score']}%")
    print("-" * 60)
    for alg, sc in result["scores"].items():
        print(f"  {alg:20s}: {sc}%")
    print("-" * 60)
    for p in result.get("matching_passages", []):
        print(f"  MATCH ({p['similarity']}%): {p['source_sentence'][:120]}")
    print("=" * 60)


def export_txt_report(result: dict, filepath: str):
    """Export a plain-text report to a file."""
    lines = [
        "ACADEMIC SUITE — PLAGIARISM REPORT",
        f"Generated: {datetime.datetime.now().isoformat()}",
        "=" * 60,
        f"Source:          {result['label_a']}",
        f"Compared With:   {result['label_b']}",
        f"Composite Score: {result['composite_score']}%",
        f"Risk Level:      {result['risk_level']}",
        "-" * 60,
        "ALGORITHM SCORES:",
        f"  TF-IDF Cosine:    {result['scores']['tfidf_cosine']}%",
        f"  N-Gram Jaccard:   {result['scores']['ngram_jaccard']}%",
        f"  Sequence Match:   {result['scores']['sequence_match']}%",
        f"  Winnowing Hash:   {result['scores']['winnowing']}%",
        "-" * 60,
        f"MATCHING PASSAGES ({len(result.get('matching_passages', []))} found):",
    ]
    for i, p in enumerate(result.get("matching_passages", []), 1):
        lines.append(f"\n  [{i}] Similarity: {p['similarity']}%")
        lines.append(f"  Source:  {p['source_sentence']}")
        lines.append(f"  Matched: {p['matched_sentence']}")

    lines.append("\n" + "=" * 60)

    with open(filepath, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))
    return filepath
