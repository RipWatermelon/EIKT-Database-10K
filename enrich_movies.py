"""
enrich_movies.py
----------------
Reads your movie CSV, adds fake fields, removes unwanted columns,
and writes a new enriched CSV.

New columns added:
  - id               (sequential, starting at 1)
  - ticket_price     (realistic USD price, e.g. $9.99 – $19.99)
  - genre            (one or more genres plausible for the movie)
  - movie_studio     (randomly chosen major/indie studio)
  - availability     (yes/no)
  - db_entry_date    (random date between 2018-01-01 and today)

Columns removed:
  - vote_count
  - original_lang

Usage:
  pip install faker pandas
  python enrich_movies.py --input movies.csv --output movies_enriched.csv
"""

import argparse
import random
from datetime import date, timedelta

import pandas as pd
from faker import Faker

fake = Faker()
random.seed(42)  # remove this line if you want different values each run

# ── Lookup tables ────────────────────────────────────────────────────────────

GENRES = [
    "Action", "Adventure", "Animation", "Comedy", "Crime",
    "Documentary", "Drama", "Fantasy", "Horror", "Mystery",
    "Romance", "Sci-Fi", "Thriller", "Western", "Family",
]

STUDIOS = [
    "Warner Bros.", "Universal Pictures", "Paramount Pictures",
    "Sony Pictures", "Walt Disney Pictures", "20th Century Studios",
    "Lionsgate Films", "A24", "Blumhouse Productions", "New Line Cinema",
    "MGM", "Miramax", "Focus Features", "Annapurna Pictures",
    "STX Entertainment", "Neon", "IFC Films", "Magnolia Pictures",
]

DB_START = date(2018, 1, 1)
DB_END   = date.today()


# ── Helpers ───────────────────────────────────────────────────────────────────

def random_ticket_price() -> str:
    """Returns a price like $12.99 in the $9–$20 range."""
    dollars = random.randint(9, 19)
    cents   = random.choice([49, 99])
    return f"${dollars}.{cents}"


def random_genres() -> str:
    """Returns 1–3 genres as a pipe-separated string, e.g. 'Action|Thriller'."""
    count = random.choices([1, 2, 3], weights=[40, 45, 15])[0]
    return "|".join(random.sample(GENRES, count))


def random_date_between(start: date, end: date) -> str:
    """Returns a random date string (YYYY-MM-DD) between start and end."""
    delta = (end - start).days
    return str(start + timedelta(days=random.randint(0, delta)))


# ── Main ──────────────────────────────────────────────────────────────────────

def enrich(input_path: str, output_path: str) -> None:
    print(f"Reading  → {input_path}")
    df = pd.read_csv(input_path)

    total = len(df)
    print(f"  {total:,} rows loaded.")

    # 1. Drop unwanted columns (silently skip if they don't exist)
    df.drop(columns=["vote_count", "original_lang"], errors="ignore", inplace=True)

    # 2. Generate new columns
    df.insert(0, "id", range(1, total + 1))

    df["ticket_price"]  = [random_ticket_price()                         for _ in range(total)]
    df["genre"]         = [random_genres()                                for _ in range(total)]
    df["movie_studio"]  = [random.choice(STUDIOS)                        for _ in range(total)]
    df["availability"]  = [random.choice(["yes", "yes", "yes", "no"])    for _ in range(total)]
    #   ↑ weighted 75 % yes / 25 % no — adjust the list to change the ratio
    df["db_entry_date"] = [random_date_between(DB_START, DB_END)          for _ in range(total)]

    # 3. Write output
    df.to_csv(output_path, index=False)
    print(f"Writing  → {output_path}")
    print(f"  Done! {total:,} rows written with {len(df.columns)} columns.")
    print(f"\n  Final columns: {list(df.columns)}")


# ── CLI ───────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Enrich a movie CSV with fake fields.")
    parser.add_argument("--input",  required=True,  help="Path to your original CSV file")
    parser.add_argument("--output", required=True,  help="Path for the enriched output CSV")
    args = parser.parse_args()

    enrich(args.input, args.output)
