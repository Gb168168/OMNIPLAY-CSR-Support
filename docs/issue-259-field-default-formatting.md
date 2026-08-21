# PR implementation task: field-level default formatting

Issue: #259

## Goal
Fix the Ragic-style form/view UI so ordinary field values such as `建單人員` and `目前進度` are readable without formatting every option/record one by one.

## Required implementation

1. Add a field-level `contentStyle` (and, where the designer already exposes field headers, `headerStyle`) to normal top-level fields, using the same normalized text-style structure already used by subtable fields in `assets/ragic-table.js`.
2. Expose one `🎨 欄位格式` editor for the whole field in the designer. It must support font size, bold, italic, strike-through, text color, background color, horizontal alignment, vertical alignment, and clear formatting.
3. Persist these styles on the schema field object. Do not copy formatting into every record and do not run a record migration.
4. Apply field-level content style in view and edit rendering. Existing select/multiselect `optionStyles` remain supported and take precedence for the option span's own visual styling.
5. Stop `adjustFontSize()` from shrinking normal form/view text below 14px. A narrow field may wrap, but must not silently become 11/12/13px.
6. Existing records and newly created records must inherit the field-level style automatically because it comes from schema.

## Precedence

`option/special style > field contentStyle > system default`

## Acceptance checks

- Set `建單人員` to 16px once: all existing and future records display at 16px.
- Set `目前進度` to 16px + bold once: all records display accordingly.
- Existing per-option colors/styles continue to work.
- No bulk writes to data records occur.
- Unstyled regular fields render at a readable minimum of 14px.
