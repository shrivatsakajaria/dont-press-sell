# The twelve runs

Daily closing values of the US stock market index from Yahoo Finance (symbol ^GSPC), built by `scripts/build-runs.ts`.

How each run is cut (spec 7.3):

- **High:** the level the market has to get back above. For a crash, the all-time record close before the fall. For a scare, its own prior peak: the highest close of the year before it (lead ruling R12). A scare falls at least 7% and under 20%; the 2014 and 2024 wobbles turned straight back up from day 1 (ruling R22).
- **Day 1:** the first close at least 7% below that high.
- **Low:** the lowest close of the run, and how far it is below the high.
- **Fall ends:** for a crash, the first close 20% above the low; for a scare, the first close two-thirds of the way back from the low to the high. After this the game fast-forwards.
- **Recovery:** the first close above the high. This is the last day of the run.
- **The fall took** high to low; **the recovery took** low to recovery. Scare reveal lines count the same way (low to recovery): whole weeks if under two months, otherwise whole months.

| Run | High | Day 1 | Low | Fall ends | Recovery | Trading days | Fall took | Recovery took |
|---|---|---|---|---|---|--:|---|---|
| c1929 | 1929-09-16 (31.86) | 1929-10-03 | 1932-06-01 (4.40, −86.19%) | 1932-07-25 | 1954-09-22 | 6,237 | 2 years 8 months | 22 years 4 months |
| c1987 | 1987-08-25 (336.77) | 1987-09-21 | 1987-12-04 (223.92, −33.51%) | 1988-03-08 | 1989-07-26 | 468 | 3 months | 20 months |
| c2000 | 2000-03-24 (1,527.46) | 2000-04-14 | 2002-10-09 (776.76, −49.15%) | 2002-11-21 | 2007-05-30 | 1,789 | 2 years 7 months | 4 years 8 months |
| c2007 | 2007-10-09 (1,565.15) | 2007-11-09 | 2009-03-09 (676.53, −56.78%) | 2009-03-23 | 2013-03-28 | 1,354 | 17 months | 4 years 1 month |
| c2020 | 2020-02-19 (3,386.15) | 2020-02-25 | 2020-03-23 (2,237.40, −33.92%) | 2020-04-08 | 2020-08-18 | 123 | 5 weeks | 5 months |
| c2022 | 2022-01-03 (4,796.56) | 2022-01-21 | 2022-10-12 (3,577.03, −25.43%) | 2023-06-08 | 2024-01-19 | 501 | 9 months | 15 months |
| s1998 | 1998-07-17 (1,186.75) | 1998-08-04 | 1998-08-31 (957.28, −19.34%) | 1998-11-02 | 1998-11-23 | 79 | 6 weeks | 3 months |
| s2011 | 2011-04-29 (1,363.61) | 2011-06-15 | 2011-10-03 (1,099.23, −19.39%) | 2011-10-27 | 2012-02-24 | 176 | 5 months | 5 months |
| s2014 | 2014-09-18 (2,011.36) | 2014-10-15 | 2014-10-15 (1,862.49, −7.40%) | 2014-10-24 | 2014-10-31 | 13 | 4 weeks | 2 weeks |
| s2018 | 2018-09-20 (2,930.75) | 2018-10-24 | 2018-12-24 (2,351.10, −19.78%) | 2019-02-05 | 2019-04-23 | 123 | 3 months | 4 months |
| s2024 | 2024-07-16 (5,667.20) | 2024-08-05 | 2024-08-05 (5,186.33, −8.49%) | 2024-08-15 | 2024-09-19 | 33 | 3 weeks | 6 weeks |
| s2025 | 2025-02-19 (6,144.15) | 2025-03-10 | 2025-04-08 (4,982.77, −18.90%) | 2025-05-12 | 2025-06-27 | 77 | 2 months | 3 months |

## In plain words

**1929: the Wall Street Crash** (crash, `c1929`). The market peaked at 31.86 on 16 September 1929. The run starts on 3 October 1929. It fell 86.19% to its lowest close on 1 June 1932, 2 years 8 months after the peak. The fall phase ends on 25 July 1932. It was back above the old high on 22 September 1954, 22 years 4 months after the low. 6,237 trading days in all. Reveal line: "That was 1929."

**1987: Black Monday** (crash, `c1987`). The market peaked at 336.77 on 25 August 1987. The run starts on 21 September 1987. It fell 33.51% to its lowest close on 4 December 1987, 3 months after the peak. The fall phase ends on 8 March 1988. It was back above the old high on 26 July 1989, 20 months after the low. 468 trading days in all. Reveal line: "That was 1987."

**2000: the dot-com crash** (crash, `c2000`). The market peaked at 1,527.46 on 24 March 2000. The run starts on 14 April 2000. It fell 49.15% to its lowest close on 9 October 2002, 2 years 7 months after the peak. The fall phase ends on 21 November 2002. It was back above the old high on 30 May 2007, 4 years 8 months after the low. 1,789 trading days in all. Reveal line: "That was 2000."

**2008: the financial crisis** (crash, `c2007`). The market peaked at 1,565.15 on 9 October 2007. The run starts on 9 November 2007. It fell 56.78% to its lowest close on 9 March 2009, 17 months after the peak. The fall phase ends on 23 March 2009. It was back above the old high on 28 March 2013, 4 years 1 month after the low. 1,354 trading days in all. Reveal line: "That was 2008."

**2020: Covid** (crash, `c2020`). The market peaked at 3,386.15 on 19 February 2020. The run starts on 25 February 2020. It fell 33.92% to its lowest close on 23 March 2020, 5 weeks after the peak. The fall phase ends on 8 April 2020. It was back above the old high on 18 August 2020, 5 months after the low. 123 trading days in all. Reveal line: "That was 2020."

**2022: inflation and interest rates** (crash, `c2022`). The market peaked at 4,796.56 on 3 January 2022. The run starts on 21 January 2022. It fell 25.43% to its lowest close on 12 October 2022, 9 months after the peak. The fall phase ends on 8 June 2023. It was back above the old high on 19 January 2024, 15 months after the low. 501 trading days in all. Reveal line: "That was 2022."

**Summer 1998 Russia scare** (scare, `s1998`). The market peaked at 1,186.75 on 17 July 1998. The run starts on 4 August 1998. It fell 19.34% to its lowest close on 31 August 1998, 6 weeks after the peak. The fall phase ends on 2 November 1998. It was back above the old high on 23 November 1998, 3 months after the low. 79 trading days in all. Reveal line: "That was the summer 1998 Russia scare. It was back in three months."

**2011 debt downgrade scare** (scare, `s2011`). The market peaked at 1,363.61 on 29 April 2011. The run starts on 15 June 2011. It fell 19.39% to its lowest close on 3 October 2011, 5 months after the peak. The fall phase ends on 27 October 2011. It was back above the old high on 24 February 2012, 5 months after the low. 176 trading days in all. Reveal line: "That was the 2011 debt downgrade scare. It was back in five months."

**Autumn 2014 wobble** (scare, `s2014`). The market peaked at 2,011.36 on 18 September 2014. The run starts on 15 October 2014. It fell 7.40% to its lowest close on 15 October 2014, 4 weeks after the peak. The fall phase ends on 24 October 2014. It was back above the old high on 31 October 2014, 2 weeks after the low. 13 trading days in all. Reveal line: "That was the autumn 2014 wobble. It was back in two weeks."

**Autumn 2018 wobble** (scare, `s2018`). The market peaked at 2,930.75 on 20 September 2018. The run starts on 24 October 2018. It fell 19.78% to its lowest close on 24 December 2018, 3 months after the peak. The fall phase ends on 5 February 2019. It was back above the old high on 23 April 2019, 4 months after the low. 123 trading days in all. Reveal line: "That was the autumn 2018 wobble. It was back in four months."

**Summer 2024 wobble** (scare, `s2024`). The market peaked at 5,667.20 on 16 July 2024. The run starts on 5 August 2024. It fell 8.49% to its lowest close on 5 August 2024, 3 weeks after the peak. The fall phase ends on 15 August 2024. It was back above the old high on 19 September 2024, 6 weeks after the low. 33 trading days in all. Reveal line: "That was the summer 2024 wobble. It was back in six weeks."

**Spring 2025 tariff scare** (scare, `s2025`). The market peaked at 6,144.15 on 19 February 2025. The run starts on 10 March 2025. It fell 18.90% to its lowest close on 8 April 2025, 2 months after the peak. The fall phase ends on 12 May 2025. It was back above the old high on 27 June 2025, 3 months after the low. 77 trading days in all. Reveal line: "That was the spring 2025 tariff scare. It was back in three months."
