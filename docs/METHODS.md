# How the statistics work

Everything here runs in the browser, in plain TypeScript, with unit tests in `tests/unit/stats.test.ts`.

## Field profiling

Each column is scanned (up to 20,000 evenly spaced rows) and classified:

| Kind | Rule |
| --- | --- |
| Latitude, longitude | Numeric in range (±90, ±180) and named like `lat`, `latitude`, `y`, `lon`, `lng`, `longitude`, `x` |
| Date | More than 90% of values parse as dates, or more than 60% when the name suggests time |
| Identifier | Numeric or text, unique per row, named like `id` or `number` |
| Amount (quantitative) | More than 90% numeric |
| Category (qualitative) | Text with at most 60 distinct values (more for very large files) |
| Text | Everything else |

Dates in `dd/mm/yyyy` and `mm/dd/yyyy` are told apart by which position ever exceeds 12. Timestamps without a time zone are kept exactly as recorded, so the hour a clerk typed is the hour the data clock shows.

## Classification

- Natural breaks: Fisher-Jenks dynamic programming on a sorted sample of at most 1,200 values, which keeps it interactive on large files.
- Quantile: equal counts per class.
- Equal interval: equal width per class.
- Goodness of variance fit (GVF) is reported for natural breaks; above 0.8 the classes describe the data well.

## Hexagon binning

Points are binned into Uber's H3 grid. The resolution is chosen so the longer side of the data's extent spans about 45 cells, and coarsened for small datasets. H3 cells at one resolution are nearly equal in area, which is why raw counts can be compared between cells without normalising by area.

## Getis-Ord Gi*

The study area is every occupied cell plus every empty cell within the neighbourhood of one. Empty cells matter: a cluster is only a cluster against quieter surroundings.

For cell *i* with binary weights *w* over its k-ring (the cell itself included):

```
Gi* = ( Σ w_ij x_j  −  x̄ Σ w_ij ) / ( S · sqrt( (n Σ w_ij² − (Σ w_ij)²) / (n − 1) ) )
S   = sqrt( Σ x_j² / n − x̄² )
```

The z-score gives a two-tailed p-value from the standard normal distribution.

## False discovery rate

Testing hundreds of cells at 95% confidence will flag about one in twenty by chance. With FDR on (the default), the Benjamini-Hochberg procedure finds, for each confidence level α in {0.10, 0.05, 0.01}, the largest sorted p-value p(k) with p(k) ≤ (k / n) · α, and uses it as the threshold for that level.

## Time slicing

The step (hour, day, week, month, quarter or year) is chosen so the data spans at most 36 periods, or set by the user. Weeks start on Monday, all buckets are calendar buckets in UTC. If the data stops before 97% of the final bucket has elapsed, that bucket is treated as incomplete and excluded from every trend test, so a half-finished month never reads as a fall.

## Mann-Kendall and Sen's slope

For each hexagon's series of counts, the Mann-Kendall S statistic is computed with the tie-corrected variance

```
Var(S) = ( n(n−1)(2n+5) − Σ t(t−1)(2t+5) ) / 18
```

and a continuity-corrected z. A trend is reported at p ≤ 0.05. Sen's slope (the median of all pairwise slopes) gives its size in events per period.

## Trend classes

| Class | Rule |
| --- | --- |
| Hot spot, rising | Overall Gi* hot spot and Mann-Kendall upward |
| Hot spot, consistently high | Overall Gi* hot spot, no significant trend |
| Hot spot, easing | Overall Gi* hot spot and Mann-Kendall downward |
| Rising, not yet a hot spot | Not significant overall, Mann-Kendall upward |
| Falling | Not significant overall, Mann-Kendall downward |
| Cold spot | Overall Gi* cold spot |

## Emerging hot spots

Gi* is run separately for every period on the same study area, then each hexagon is classed by its run of hot periods. The definitions follow the spirit of Esri's Emerging Hot Spot Analysis:

| Class | Rule |
| --- | --- |
| New | Hot only in the final period |
| Consecutive | An unbroken run of hot periods ending in the final one, fewer than 90% of periods hot |
| Intensifying | Hot in at least 90% of periods including the final one, Mann-Kendall upward |
| Persistent | Hot in at least 90% of periods, no significant trend |
| Diminishing | Hot in at least 90% of periods, Mann-Kendall downward |
| Sporadic | Hot on and off, hot in the final period, never cold |
| Oscillating | Hot in the final period, cold in some earlier period |
| Historical | Hot in at least 90% of periods but not the final one |

## Colour-vision simulation

Colours are converted to linear RGB, multiplied by the Machado, Oliveira and Fernandes (2009) matrices for protanopia, deuteranopia and tritanopia at full severity, and compared in CIE L\*a\*b\* (ΔE 1976). The audit warns when the closest pair of category colours falls below 8 ΔE under protan or deutan simulation.

## Coordinate conversion of the London sample

British National Grid eastings and northings are converted to OSGB36 latitude and longitude with the Ordnance Survey inverse transverse Mercator series on the Airy 1830 ellipsoid, then to WGS84 with the standard seven-parameter Helmert transformation. The script is [`scripts/prep_lfb.py`](../scripts/prep_lfb.py); the result is within 53 m of the published coordinates, which matches the publisher's 50 m rounding.
