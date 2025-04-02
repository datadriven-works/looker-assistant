# A Comprehensive Guide to Looker Filter Expressions

Looker’s **filter expressions** provide an advanced and flexible way to filter your data. They can be used:
- In the **Explore** section by selecting **matches (advanced)** on a filter.
- In **LookML** (for example, in a [filters](https://docs.looker.com/reference/param/filters) parameter).

> **Caution**: Filter expressions described here differ from the phrases used in *basic filters* in the Explore. You should only use these expressions with the Explore **matches (advanced)** option (or in LookML where a `filters` parameter is allowed).  
> **Note**: Filter expressions **aren’t supported** with **access grants**. See the [access_grant documentation](https://docs.looker.com/reference/param/access_grant) for more details.

---

## Table of Contents

- [A Comprehensive Guide to Looker Filter Expressions](#a-comprehensive-guide-to-looker-filter-expressions)
  - [Table of Contents](#table-of-contents)
  - [General Usage and Syntax](#general-usage-and-syntax)
  - [String Filters](#string-filters)
    - [Including Special Characters](#including-special-characters)
  - [Date and Time Filters](#date-and-time-filters)
    - [Basic Structure of Date and Time Filters](#basic-structure-of-date-and-time-filters)
      - [Examples](#examples)
    - [Absolute Dates](#absolute-dates)
    - [Relative Dates](#relative-dates)
      - [Day Examples](#day-examples)
      - [Week Examples](#week-examples)
      - [Month Examples](#month-examples)
      - [Quarter and Year](#quarter-and-year)
  - [Boolean Filters](#boolean-filters)
  - [Number Filters](#number-filters)
    - [Examples](#examples-1)
  - [Location Filters](#location-filters)
    - [Supported Units of Measurement](#supported-units-of-measurement)
  - [Using User Attribute Values](#using-user-attribute-values)

---

## General Usage and Syntax

1. **Where to place expressions**  
   - **Explore**: If you are in an Explore, add or edit a filter, choose **matches (advanced)**, and type your expression directly (no quotes needed).
   - **LookML**: If you are adding a filter expression in a LookML parameter (such as `filters` for a measure or a [default_filter_value](https://docs.looker.com/reference/param/default_filter_value) for a dashboard), **wrap the expression in quotes**. 
     - Example:
       ```lookml
       filters: [ city: "FOO%" ]
       ```

2. **Case sensitivity**  
   - By default, Looker determines case sensitivity based on your [model’s `case_sensitive` setting](https://docs.looker.com/reference/model-params/case_sensitive) and your database dialect support. If `case_sensitive` is enabled, expressions like `FOO%` **will not** match `food`. If it’s not enabled, or your dialect ignores case, `FOO%` can match `food`.

3. **Basic vs. Advanced**  
   - **Basic filters** in Looker let you choose from a few "plain-English" options (e.g., "is equal to", "contains", etc.). These may not map directly to the syntax shown in this guide. 
   - **Advanced filters (matches (advanced))** use the expressions in this guide.

4. **Negation**:  
   - A leading minus sign (`-`) generally indicates a negation in string filters (e.g., `-FOO` means "anything except `FOO`").  
   - In numeric filters, `NOT` or operators like `<>`, `!=`, or using parentheses `[ ]`, `( )` can achieve negations or exclusive ranges.

---

## String Filters

String filter expressions match exact text, partial text, or exclude certain text. Below are examples and their descriptions:

| Expression   | Description                                                                                     |
|--------------|-------------------------------------------------------------------------------------------------|
| `FOO`        | Is equal to `"FOO"`, exactly.                                                                   |
| `FOO,BAR`    | Is equal to either `"FOO"` or `"BAR"`, exactly.                                                 |
| `%FOO%`      | Contains `"FOO"` (matches "buffoon", "fast food", etc.).                                        |
| `FOO%`       | Starts with `"FOO"` (matches "food", "foolish", etc.).                                          |
| `%FOO`       | Ends with `"FOO"` (matches "buffoo", "fast foo").                                               |
| `EMPTY`      | String is empty or `NULL`.                                                                      |
| `NULL`       | Value is `NULL`. *(In LookML filter parameters, use `"NULL"` as a string literal.)*             |
| `-FOO`       | Not equal to `"FOO"`.                                                                           |
| `-FOO,-BAR`  | Not equal to `"FOO"` or `"BAR"`.                                                                |
| `-%FOO%`     | Does not contain `"FOO"`.                                                                       |
| `FOO%,BAR`   | Starts with `"FOO"` **OR** is `"BAR"` exactly.                                                  |
| `FOO%,-FOOD` | Starts with `"FOO"` but is not `"FOOD"`.                                                        |
| `-EMPTY`     | String is not empty (has at least one character).                                               |
| `-NULL`      | Value is not `NULL`. *(In LookML filter parameters, use `"-NULL"`.)*                            |
| `_UF`        | Matches any single character followed by `"UF"` (for instance, `"buffoon"` if we consider `bUF`).|

### Including Special Characters

- **Escape the following with a caret `^`:**  
  - `"` (double quote)  
  - `%`  
  - `_`  
  - A **leading** `-` (for negation). If the `-` is not the first character, you don’t need to escape it.  
  - `^` itself can be escaped as `^^`.  

- **Commas**:
  - In a regular UI string filter (basic filtering), use a backslash: `Santa Cruz\, CA`.
  - In an **advanced** filter (Explore *matches (advanced)* or LookML filter strings), prefix the comma with `^`:  
    ```lookml
    filters: [ city: "Santa Cruz^, CA" ]
    ```
    or in an Explore "matches (advanced)" filter: `Santa Cruz^, CA`.

Example in LookML:
```lookml
field: filtered_count {
  type: count
  filters: [ city: "Santa Cruz^, CA" ]
}
```

---

## Date and Time Filters

Looker supports **natural language** date/time phrases in filters, letting you define both *absolute* and *relative* date or time ranges.

### Basic Structure of Date and Time Filters

- **Common placeholders**:  
  - **{n}** = An integer (e.g., `3`).  
  - **{interval}** = A time period (e.g., `day`, `month`, `week`, `year`).  
  - **{time}** = A specific date/time in `YYYY-MM-DD HH:MM:SS` or `YYYY/MM/DD HH:MM:SS` format.

- **Supported phrases**:
  - `this {interval}` (e.g., `this month`, `this year`)  
  - `{n} {interval}` (e.g., `3 days`)  
  - `{n} {interval} ago` (e.g., `3 days ago`)  
  - `{time}` (e.g., `2018-05-10`)  
  - `before {time}`, `after {time}`  
  - `{time} to {time}`  
  - `{time} for {n} {interval}` (e.g., `2018-05-10 for 3 days`)  
  - `yesterday`, `today`, `tomorrow`  
  - `{day of week}` (e.g., `Monday`)  
  - `next {week|month|quarter|year}`, etc.  
  - `{n} {interval} from now for {n} {interval}`, etc.

- **Combining filters**:
  - **OR logic**: Separate multiple expressions with commas in a single filter. E.g., `today, 7 days ago`.
  - **AND logic**: Use multiple filters or multiple lines. E.g., one filter line with `after 2014-01-01`, another with `before 2 days ago`.

#### Examples
- `this month`  
- `3 days ago`  
- `2018-05-10 to 2018-05-18`  
- `before 2018-05-10`  
- `after 2018-10-05`  
- `yesterday`, `today`, `tomorrow`

---

### Absolute Dates

Use explicit dates or date/time values:

| Expression            | Description                                                                                                 |
|-----------------------|-------------------------------------------------------------------------------------------------------------|
| `2018/05/29`          | Any time on 2018/05/29 (00:00 through 23:59).                                                               |
| `2018/05/10 for 3 days`  | From 2018/05/10 00:00:00 through 2018/05/12 23:59:59.                                                   |
| `after 2018/05/10`    | From 2018/05/10 00:00:00 onward (inclusive).                                                               |
| `before 2018/05/10`   | Before 2018/05/10 00:00:00 (exclusive).                                                                    |
| `2018/05`             | Entire month of May 2018.                                                                                  |
| `2018`                | Entire year of 2018 (2018/01/01 00:00:00 to 2018/12/31 23:59:59).                                          |
| `FY2018`              | Entire fiscal year starting in 2018 (depending on the fiscal start configured by your Looker developers).   |
| `FY2018-Q1`           | First fiscal quarter of 2018.                                                                              |

---

### Relative Dates

Use date/time ranges that roll relative to “now” or “today.” The examples below assume the current date/time is **Friday, 2018-05-18 18:30:02**.

#### Day Examples
| Expression            | Description                                                                              |
|-----------------------|------------------------------------------------------------------------------------------|
| `today`               | Current day: 2018-05-18 00:00 to 2018-05-18 23:59.                                       |
| `1 day ago`           | Just yesterday: 2018-05-17 00:00 to 2018-05-17 23:59.                                    |
| `7 days ago for 7 days` | The last 7 complete days: 2018-05-11 00:00 to 2018-05-17 23:59.                         |
| `last 3 days`         | 2 days ago through today: 2018-05-16 00:00 to 2018-05-18 23:59.                           |

#### Week Examples
- `this week`: 2018-05-14 (Monday) 00:00 to 2018-05-20 (Sunday) 23:59.  
- `last week` or `1 week ago`: The previous full Monday-Sunday period.  
- `next week`: The next Monday-Sunday period.

#### Month Examples
- `this month`: 2018-05-01 00:00 to 2018-05-31 23:59.  
- `last month`: 2018-04-01 00:00 to 2018-04-30 23:59.  
- `2 months ago`: 2018-03-01 00:00 to 2018-03-31 23:59.

#### Quarter and Year
- `this quarter`, `last quarter` (e.g., Q1, Q2, etc. or fiscal quarter if `fiscal` is specified).
- `this year`, `last year` (e.g., 2018, 2017, or the relevant fiscal years).

> **Tip**: If your Looker project is configured to start the fiscal year in a specific month, you can write expressions like `last fiscal quarter` or `last fiscal year`.

---

## Boolean Filters

Filtering on true/false in Looker depends on how the underlying field is defined in your data or in your LookML:

| Expression         | Description                                                                                         |
|--------------------|-----------------------------------------------------------------------------------------------------|
| `yes` / `no`       | For Looker `type: yesno` fields (dimensions). *(lowercase in Explore; uppercase in `filters` param)*|
| `TRUE` / `FALSE`   | For fields that contain a **native boolean database type** (true/false).                            |

---

## Number Filters

Number filters support:
- **Natural language**: e.g., `5 to 10`.
- **Relational operators**: `<`, `>`, `=`, `!=`, `<=`, `>=`.
- **Logical operators**: `AND`, `OR`, `NOT`.
- **Multiple ranges**: `5 to 10 OR 30 to 40`.
- **Interval notation**: `[5, 90]`, `(5, 90)`, etc.

### Examples

| Expression                | Description                                                                                                                               |
|---------------------------|-------------------------------------------------------------------------------------------------------------------------------------------|
| `5`                       | Exactly 5.                                                                                                                               |
| `NOT 5` / `<>5` / `!=5`   | Any value except exactly 5.                                                                                                               |
| `1,3,5,7`                 | In the set {1,3,5,7}.                                                                                                                    |
| `NOT 66,99,4`             | Any value except 66, 99, or 4.                                                                                                            |
| `>1 AND <100`             | Greater than 1 AND less than 100.                                                                                                         |
| `5.5 to 10`               | 5.5 or greater but also 10 or less (i.e., `>=5.5 AND <=10`).                                                                              |
| `NOT 3 to 80.44`          | Less than 3 OR greater than 80.44 (negating a range splits it into `<3 OR >80.44`).                                                      |
| `[5, 90]`                 | 5 ≤ x ≤ 90.                                                                                                                               |
| `(12, 20]`                | 12 < x ≤ 20.                                                                                                                             |
| `(500,)`                  | x > 500 (open-ended upper bound is "infinite").                                                                                           |
| `NULL`                    | Value has no data (is NULL). *(In LookML filter parameters, write `"NULL"`.)*                                                             |
| `[0,9],[20,29]`           | x between 0 and 9 inclusive OR between 20 and 29 inclusive.                                                                               |
| `NOT (3,12)`              | x ≤ 3 OR x ≥ 12 (the negation of 3 < x < 12).                                                                                             |

> **Note on Negation**: If the first filter in a list uses a NOT, the entire filter expression can become negated. Make sure you test your logic in the Explore or re-check your SQL if you see unexpected results.

---

## Location Filters

Location filters let you match on **latitude** and **longitude** in flexible ways, including bounding boxes and radii:

| Expression                                            | Description                                                                                                                                               |
|-------------------------------------------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------|
| `36.97, -122.03`                                      | Location is exactly latitude `36.97`, longitude `-122.03`.                                                                                                |
| `40 miles from 36.97, -122.03`                        | Location is within 40 miles of latitude `36.97`, longitude `-122.03`.                                                                                     |
| `inside box from 72.33, -173.14 to 14.39, -61.70`      | Location is within a rectangular bounding box. NW corner is `(72.33, -173.14)`, SE corner is `(14.39, -61.70)`.                                            |
| `NULL`                                                | Location is null (latitude or longitude is null). *(In LookML, `filters: [ location: "NULL" ]` )*                                                         |
| `-NULL` or `NOT NULL`                                 | Location has both latitude and longitude (neither is null). *(In LookML, `filters: [ location: "-NULL" ]` or `[ location: "NOT NULL" ]` )*                |

### Supported Units of Measurement

When filtering around a point, you can use:
- `meters`
- `feet`
- `kilometers`
- `miles`

> **Singular forms** (`mile`, `meter`, etc.) aren’t supported, so use `miles`, `meters`, `feet`, or `kilometers`.

---

## Using User Attribute Values

In some scenarios, you may want to use the **value of a user attribute** directly in a filter expression. You can do so via Liquid variables in your filter string.

1. **Reference user attributes** with the following syntax:
   ```liquid
   {{ _user_attributes['attribute_name'] }}
   ```
2. **Example**: Suppose a user attribute named `salesforce_username` is stored as `jsmith` in Looker, but the database prefix is `sf_`. You could create a filter:
   ```liquid
   sf_{{ _user_attributes['salesforce_username'] }}
   ```
   This would become `sf_jsmith` in the SQL generated by Looker.

You can use the same Liquid pattern in:
- **LookML dashboard filters**  
- **Dashboard element filters**  
- **Explore** *matches (advanced)* filters  
