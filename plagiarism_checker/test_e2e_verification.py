import time
from scanner import scan_document
from cli import print_scan_report
import os

pdf_path = "samples/sample_paper.pdf"

if not os.path.exists(pdf_path):
    print(f"Error: {pdf_path} not found.")
    exit(1)

print("========================================")
print("       INITIATING FIRST SCAN            ")
print("========================================")
t0 = time.time()
res1 = scan_document(pdf_path, verbose=True)
t1 = time.time()
first_scan_time = t1 - t0
print_scan_report(res1)

print("\n\n========================================")
print("       INITIATING SECOND SCAN           ")
print("========================================")
t0 = time.time()
res2 = scan_document(pdf_path, verbose=True)
t1 = time.time()
second_scan_time = t1 - t0
print_scan_report(res2)

print("\n\n========================================")
print("       PERFORMANCE IMPROVEMENT          ")
print("========================================")
print(f"First scan time:  {first_scan_time:.2f} s")
print(f"Second scan time: {second_scan_time:.2f} s")
if second_scan_time > 0:
    speedup = first_scan_time / second_scan_time
    print(f"Speedup:          {speedup:.1f}x faster")
print("========================================")
