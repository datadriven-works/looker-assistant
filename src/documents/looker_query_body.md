# Query Object Documentation (Editable Properties Only)

This document details the **editable (non-read-only)** properties of a **Query** object, describing the expected inputs (parameters) for defining and executing a Looker query.

---

## Overview

A **Query** object encapsulates all information needed to run a query in Looker. This includes fields to select, filters to apply, sorting preferences, limits, visualization configurations, and more. Below is a breakdown of the properties that can be modified (i.e., not read-only) and their roles in configuring a query.

---

## Properties

### 1. `model`
- **Type**: `string`
- **Description**: The name of the LookML model on which the query is based.

### 2. `view`
- **Type**: `string`
- **Description**: The name of the Explore (often referred to as a “view” in the query context) within the specified model.

### 3. `fields`
- **Type**: `string[]`
- **Description**: A list of field names (dimensions or measures) to include in the query result.

### 4. `pivots`
- **Type**: `string[]`
- **Description**: A list of fields on which to pivot the result set. Pivoted fields become columns in the result, and their values split the data accordingly.

### 5. `fill_fields`
- **Type**: `string[]`
- **Description**: A list of fields used to “fill” data in pivoted results. Typically used for keeping pivoted columns consistent even when some dimension values might not be present in the data.

### 6. `filters`
- **Type**: `object`
- **Description**:  
  - Contains **filter key-value pairs** for the query.  
  - This property handles straightforward filters without logical `OR` conditions.

### 7. `filter_expression`
- **Type**: `string`
- **Description**:  
  - A string defining more complex filters (those that may include `OR` conditions or advanced logic).  
  - If set, it can override or supplement the simpler key-value pairs in `filters`.

### 8. `sorts`
- **Type**: `string[]`
- **Description**:  
  - Specifies the sort order for the results.  
  - Each array entry follows the convention `"field_name sort_direction"` (e.g., `"orders.count desc"`).

### 9. `limit`
- **Type**: `string`
- **Description**:  
  - The **row limit** for the query results.  
  - Set to a positive integer (as a string, e.g., `"100"`) to specify the maximum number of rows.  
  - Set to `"-1"` for no limit (i.e., “unlimited” rows).

### 10. `column_limit`
- **Type**: `string`
- **Description**:  
  - Limits the **number of columns** returned in the query.  
  - Useful for avoiding unmanageably wide results, especially when pivoting on a large set of values.

### 11. `total`
- **Type**: `boolean`
- **Description**:  
  - Indicates whether a **total row** should be calculated and included in the query results.

### 12. `row_total`
- **Type**: `string`
- **Description**:  
  - Defines the type of row total (e.g., grand total) to show.  
  - Typically used in conjunction with pivoted queries to provide an overall summary.

### 13. `subtotals`
- **Type**: `string[]`
- **Description**:  
  - The fields for which **subtotal rows** should be calculated in pivoted queries.

### 14. `vis_config`
- **Type**: `object`
- **Description**:  
  - Configuration properties for visualizations.  
  - Often includes a `"type"` key (e.g., `"bar"`, `"table"`) to specify the chart type.  
  - Additional keys can be used for styling, formatting, legends, etc.  
  - Unknown keys are ignored by the visualization engine, allowing flexible customization.

### 15. `filter_config`
- **Type**: `object`
- **Description**:  
  - Represents the **state of the filter UI** on the Explore page.  
  - When running a query via the Looker UI, it takes precedence over `filters`.  
  - When **creating or modifying** a query programmatically, set this to `null`.  
  - Modifying it directly can lead to unexpected filtering in the UI.  
  - Considered “opaque” (no guaranteed structure outside of Looker’s own use).

### 16. `visible_ui_sections`
- **Type**: `string`
- **Description**:  
  - An internal detail indicating which parts of the Looker UI are visible for the query.  
  - Typically not critical for external use unless you’re programmatically replicating or managing the UI state.

### 17. `dynamic_fields`
- **Type**: `string`
- **Description**:  
  - A JSON-encoded string specifying **dynamic fields**, such as **table calculations** or custom fields created for this query.

### 18. `client_id`
- **Type**: `string`
- **Description**:  
  - Used to generate shortened Explore URLs.  
  - If set manually, it must be a **unique 22-character alphanumeric** string.  
  - If not provided, Looker will generate one automatically.

### 19. `query_timezone`
- **Type**: `string`
- **Description**:  
  - The **timezone** in which time-based filters and fields will be evaluated.  
  - If not specified, the default user or system timezone is typically used.

---

## Additional Notes

- The above properties can be freely set or updated when creating or modifying a query. 
- For advanced filtering logic (including any use of `OR`), prefer `filter_expression` over simple `filters`.  
- Avoid setting `filter_config` unless you specifically need to mimic or override the UI-based filter behavior.

---

## Example Usage

```json
{
  "model": "ecommerce_model",
  "view": "orders",
  "fields": [
    "orders.id",
    "orders.count",
    "users.name"
  ],
  "filters": {
    "orders.created_date": "90 days"
  },
  "sorts": [
    "orders.count desc"
  ],
  "limit": "100",
  "column_limit": "50",
  "total": true,
  "vis_config": {
    "type": "table",
    "show_row_numbers": true
  },
  "filter_config": null
}
```

In this example:
- The model is set to `"ecommerce_model"`, and the Explore is `"orders"`.
- Three fields are selected: `"orders.id"`, `"orders.count"`, and `"users.name"`.
- A simple filter restricts the data to `"orders.created_date"` within the last 90 days.
- The results are sorted by `orders.count` in descending order.
- The row limit is set to `"100"`, and the column limit to `"50"`.
- A total row is included (`"total": true`).
- The visualization is configured as a table with row numbers.
- `filter_config` is null, meaning no special UI-based filters will override the `filters` property.

---

## Conclusion

Use these editable properties to define a Looker **Query** object. By carefully combining fields, filters, pivot options, sorting, and visualization settings, you can build robust data explorations and dashboards. If you require complex filtering logic, use `filter_expression` to handle `OR` conditions or advanced filter clauses.