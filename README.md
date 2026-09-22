# @cocreate/elements

Bind any HTML element directly to your data using HTML5 attributes. An element declares *where its value lives* — a storage, database, array, document, and key — and the module handles the rest: reading the value in, writing changes back, and keeping it synchronized in realtime as other clients and servers broadcast updates. There is no query code, no fetch layer, and no view model. The markup is the data binding.

---

## Documentation

For a complete guide and working demo refer to the [documentation](https://cocreate.app/docs/elements).

## Table of Contents

* [Features](#features)
* [Installation](#installation)
* [Usage](#usage)
* [How it Works](#how-it-works)
* [The Data Scope](#the-data-scope)
* [Core Attributes](#core-attributes)
* [Behavior Attributes](#behavior-attributes)
* [Key Expressions](#key-expressions)
* [Value Pipeline](#value-pipeline)
* [Forms](#forms)
* [Filtering and Lists](#filtering-and-lists)
* [Realtime Synchronization](#realtime-synchronization)
* [Actions](#actions)
* [Element Methods](#element-methods)
* [JavaScript API](#javascript-api)
* [Behavior Notes](#behavior-notes)
* [Announcements](#announcements)
* [Roadmap](#roadmap)
* [How to Contribute](#how-to-contribute)
* [About](#about)
* [License](#license)

---

## Features

* **Declarative Data Binding:** Point an element at a document field and it reads, renders, and persists that field without any application code.
* **Automatic CRUD Resolution:** The operation is inferred from the attributes present, so the same markup creates a record when it has no id and updates it when it does.
* **Realtime Two-Way Sync:** Elements subscribe to their own data scope and update instantly when the underlying record changes anywhere in the system.
* **Batched Reads:** Elements sharing a scope are collected into a single query, so a document bound across twenty fields performs one read.
* **Forms as Documents:** A form groups fields into one payload, propagates its scope to its children, and saves them as a single operation.
* **Value Transformation Pipeline:** Type coercion, prefixes, suffixes, replacements, casing, and encoding are applied on the way in and out.
* **Filter Integration:** Works with `@cocreate/filter` to drive queries, sorting, pagination, and infinite scroll from markup.
* **Action Integration:** Registers `save`, `delete`, and `reset` so persistence composes into action chains.
* **Automatic Binding:** Elements inserted later, including rendered templates, are initialized and subscribed automatically.

---

## Installation

```bash
npm install @cocreate/elements
```

```bash
yarn add @cocreate/elements
```

### CDN

```html
<script src="https://cdn.cocreate.app/elements/latest/CoCreate-elements.min.js"></script>
```

---

## Usage

### Display a Value

```html
<span array="users" object="64b9a32e18f21bc56789abcd" key="name"></span>
```

The element reads the `name` field of that document and renders it. If the document changes anywhere in the system, the element updates.

### Edit a Value

```html
<input
	array="users"
	object="64b9a32e18f21bc56789abcd"
	key="email"
	realtime="true" />
```

With `realtime`, every keystroke persists the field. Without it, the value is saved when a `save` action runs.

### Group Fields Into a Document

```html
<form array="users" object="64b9a32e18f21bc56789abcd">
	<input key="name" />
	<input key="email" />
	<textarea key="bio"></textarea>

	<button actions="save">Save</button>
</form>
```

The form propagates its scope to every field, so each input only declares its `key`. Saving sends one payload containing all three fields.

### Create a Record

```html
<form array="users" object>
	<input key="name" />
	<input key="email" />

	<button actions="save, reset">Create</button>
</form>
```

An empty `object` attribute means "no document yet". On save the module issues a create, then writes the new id back into the form and its fields, so subsequent saves update the same record.

### Render a List

```html
<div
	array="users"
	object
	filter-query-key="status"
	filter-query-value="active"
	filter-limit="20"
	filter-sort-key="name"
	render-query="[template]">
	<div template>
		<span>{{object.name}}</span>
		<span>{{object.email}}</span>
	</div>
</div>
```

### Delete a Record

```html
<button
	array="users"
	object="64b9a32e18f21bc56789abcd"
	actions="delete">
	Delete
</button>
```

Multiple targets can be selected with `delete-query`. Each target declares its
own CRUD scope; object targets sharing the same storage, database, and array are
sent in one delete request.

```html
<button
	actions="delete"
	delete-query="$document [data-delete]:checked[]">
	Delete selected
</button>

<input
	type="checkbox"
	data-delete
	array="users"
	object="64b9a32e18f21bc56789abcd" />
```

---

## How it Works

1. On load the module scans for elements declaring `storage`, `database`, `array`, or `render-json`.
2. Each element's attributes are parsed into a normalized CRUD payload, and its **type** is inferred from which attributes are present.
3. A **dataKey** is generated from the scope, and every element sharing that key is grouped together. Field-level `key` is deliberately excluded from document-scope keys so all fields of one document share a single scope.
4. The scope is subscribed to over the socket so future changes are pushed to every bound element.
5. Reads are debounced and batched, so one query serves every element in the scope.
6. The response is distributed to each element, which extracts its own field and renders it through the value pipeline.
7. Editable elements listen for input. When `realtime` is enabled, changes persist automatically.
8. Writes resolve to a create or an update depending on whether an id is present, and the resulting id is propagated back into the markup.

---

## The Data Scope

Attributes describe a hierarchy, from the storage provider down to a single field.

| Level | Attribute | Description |
| ----- | --------- | ----------- |
| Storage | `storage` | Storage provider or alias |
| Database | `database` | Database name |
| Array | `array` | Collection, table, or dataset |
| Index | `index` | Index within the array |
| Object | `object` | Document id, empty for a new document |
| Key | `key` | Field within the document |

The **type** of operation is inferred from the deepest level present:

| Attributes Present | Inferred Type |
| ------------------ | ------------- |
| `object` or `key` (with `array`) | `object` |
| `index` (with `array`) | `index` |
| `array` | `array` |
| `database` | `database` |
| `storage` | `storage` |

Any of these may hold a comma separated list to target several scopes at once.

```html
<div array="users, admins" key="name"></div>
```

---

## Core Attributes

| Attribute | Description |
| --------- | ----------- |
| `storage` | Storage provider targeted by the operation |
| `database` | Database name, defaults to the organization |
| `array` | Collection or table name |
| `index` | Index scope within the array |
| `object` | Document id. Empty creates a new document, `ObjectId()` generates one, `pending` marks a create in flight |
| `key` | Field path within the document |
| `updateName` | Rename target when updating a named scope |
| `organization_id` | Tenant identifier |
| `host` | Host context |
| `apikey` | API key used for the operation |
| `room` | Realtime room scope |
| `reference` | When `false`, strips storage metadata from the returned object |

---

## Behavior Attributes

Each of these accepts `"false"` to opt out, and most default to enabled.

| Attribute | Description |
| --------- | ----------- |
| `crud="false"` | Excludes the element from binding entirely |
| `read="false"` | Element never reads, it only writes |
| `save="false"` | Element never writes, it only reads |
| `update="false"` | Element ignores incoming updates after its first read |
| `listen="false"` | Element ignores broadcasts, but still accepts its own reads |
| `delete` | Marks the element as a delete target |
| `upsert` | Creates the document if it does not exist when updating |
| `realtime="true"` | Persists on every input event |
| `crdt="true"` | Routes text edits through collaborative merge instead of overwriting |
| `broadcast="false"` | Suppresses broadcasting the change to other clients |
| `broadcast-sender="false"` | Suppresses echoing the change back to the sender |
| `broadcast-client="false"` | Suppresses propagation to other tabs |
| `form-attributes="false"` | Prevents the element from inheriting its form's scope |
| `reset` | Controls reset behavior, see [Forms](#forms) |
| `splice`, `slice`, `update` | Array mutation modes when the key targets an index |

---

## Key Expressions

`key` supports more than a plain field name.

| Expression | Resolves To |
| ---------- | ----------- |
| `name` | A top-level field |
| `profile.address.city` | A nested field via dot notation |
| `tags[0]` | An array member by index |
| `{}` | The entire document, for reading or writing whole objects |
| `tags.$length` | The length of an array field |
| `$data` | The complete response payload |
| `$object` / `$array` | The full result collection for the current type |

```html
<span array="posts" object="64b9a32e18f21bc56789abcd" key="comments.$length"></span>
```

---

## Value Pipeline

Values are transformed on the way in and out by `@cocreate/element-prototype`. These attributes apply to any bound element.

| Attribute | Description |
| --------- | ----------- |
| `value-type` | Coerces the value, for example `json`, `html`, `text`, `array`, `number` |
| `value-prefix` | Prepends a string |
| `value-suffix` | Appends a string |
| `value-replace` | Replaces the first match of a pattern |
| `value-replaceall` | Replaces every match of a pattern |
| `value-replacement` | Replacement string used by the above |
| `value-lowercase` | Lowercases the value |
| `value-uppercase` | Uppercases the value |
| `value-encode` | Encodes the value, for example base64 or URI |
| `value-decode` | Decodes the value |
| `value-remove-query` | Removes matching nodes before reading an HTML value |
| `value-dispatch` | Clears the value when a query returns no results |
| `value-bubbles` | Bubbles the synthetic input event |
| `value-query` | Composes this element's value from other elements |
| `value-attribute` | Writes the composed value to an attribute instead of the value |

```html
<textarea
	array="files"
	object="64b9a32e18f21bc56789abcd"
	key="src"
	value-type="text"
	value-replaceall="/```html\n|\n```/g"></textarea>
```

---

## Forms

### Scope Inheritance

A form propagates `organization_id`, `host`, `storage`, `database`, `array`, `index`, `object`, and `key` to descendant elements that participate in binding. Add `form-attributes="false"` to an element that must keep its own scope.

### Generated Ids

`object="ObjectId()"` generates a client-side id at initialization, letting related records reference each other before they are persisted.

### Saving

Saving a form collects every bound field into one payload per type and issues a single operation. Saving an individual element inside a form delegates to the form, so a field never writes a partial document by accident.

### Reset

The `reset` attribute controls what a reset preserves.

| Value | Document Id | Value |
| ----- | ----------- | ----- |
| omitted | cleared | cleared |
| `object` | cleared | preserved |
| `value` | preserved | cleared |
| `false` | preserved | preserved |

```html
<input key="organization_id" value="$organization_id" reset="false" hidden />
```

---

## Filtering and Lists

Filter attributes from `@cocreate/filter` compose directly with a bound scope to drive queries, sorting, limits, and pagination.

```html
<div
	array="posts"
	object
	filter-query-key="status"
	filter-query-value="published"
	filter-sort-key="created.on"
	filter-sort-direction="desc"
	filter-limit="10"
	render-query="[template]">
	<div filter-on="scroll" filter-query="$parent"></div>
	<article template>{{object.title}}</article>
</div>
```

A filter element may target another element with `filter-query`, so an input elsewhere on the page can drive a list's query. Changing a filter re-reads the scope and re-renders.

---

## Realtime Synchronization

Every scope subscribes over the socket on two channels: one for the specific document and one for the collection it belongs to. A change therefore reaches both the element bound to that record and any list rendering the collection.

Subscriptions are reference counted. When the last element bound to a scope is removed from the DOM, the module unsubscribes automatically, so rendered lists and modals do not leak channels.

---

## Actions

| Action | Completion Event | Behavior |
| ------ | ---------------- | -------- |
| `save` | `saved` | Persists the element, or its form when it belongs to one |
| `delete` | `deleted` | Deletes the bound document, honoring `delete-query` for multiple targets |
| `reset` | `reset` | Restores the form according to each field's `reset` attribute |

```html
<button actions="save, reset">Save and clear</button>
```

---

## Element Methods

Binding attaches methods directly to elements, so imperative code and action chains share one implementation.

| Method | Available On | Description |
| ------ | ------------ | ----------- |
| `getValue()` | any bound element | Reads the value through the value pipeline |
| `setValue(value)` | any bound element | Writes the value and dispatches input and change |
| `read()` | any bound element | Re-reads the element's scope |
| `save()` | any bound element or form | Persists the element or the whole form |
| `getData()` | forms | Returns the assembled payload without saving |
| `getFilter()` / `setFilter()` | filtered elements | Reads or replaces the active filter, re-reading the scope |

```javascript
const form = document.querySelector("#profile");
const payload = await form.getData();
await form.save();
```

---

## JavaScript API

```javascript
import elements from "@cocreate/elements";

elements.init();
elements.init(document.querySelector("#profile"));
```

| Method | Description |
| ------ | ----------- |
| `init(element)` | Initializes an element, a collection, or the whole document |
| `read(element, data, dataKey)` | Reads a scope and distributes the result |
| `save(element, action)` | Persists an element or form |
| `getData(element)` | Assembles the payload for an element or form |
| `getDataObject(element)` | Normalizes an element's attributes into a CRUD payload |
| `reset(action)` | Runs reset logic for a form |
| `setDataType(element, data, action)` | Applies a created record's id back into the markup |
| `elements`, `keys`, `forms` | Internal registries of bound elements and scopes |

---

## Behavior Notes

* An element must declare `storage`, `database`, or `array` to be initialized. A lone `object` or `key` is not a binding, which is why fields inside a form rely on inherited scope.
* Reads are debounced for 500ms and deduplicated per scope, so many elements binding one document produce a single query.
* An element reads once per scope. Changing a filter or calling `read()` resets that state.
* A document id must be a 24 character hexadecimal value, or the placeholders `pending` and `ObjectId()`.
* Elements rendered on the server carry a `rendered` marker and skip their first client render, preserving server output.
* Save on input requires `realtime`, and never applies to a `_id` field.
* When `crdt` is enabled and a document id exists, text edits merge collaboratively rather than overwriting.

---

## Announcements

All updates to this library are documented in our [CHANGELOG](https://github.com/CoCreate-app/CoCreate-elements/blob/master/CHANGELOG.md) and [releases](https://github.com/CoCreate-app/CoCreate-elements/releases). You may also subscribe to email for releases and breaking changes.

---

## Roadmap

Upcoming enhancements include:

* Expanded array mutation operators
* Optimistic write rollback on failure
* Schema-aware value coercion
* Development mode diagnostics for unbound and misconfigured scopes
* Devtools inspection of an element's scope and subscriptions

If you are interested in the future direction of this project, please take a look at our open [issues](https://github.com/CoCreate-app/CoCreate-elements/issues) and [pull requests](https://github.com/CoCreate-app/CoCreate-elements/pulls). We would love to hear your feedback.

---

## How to Contribute

We encourage contribution to our libraries (you might even score some nifty swag), please see our [CONTRIBUTING](https://github.com/CoCreate-app/CoCreate-elements/blob/master/CONTRIBUTING.md) guide for details.

We want this library to be community-driven, and CoCreate led. We need your help to realize this goal. To help make sure we are building the right things in the right order, we ask that you create [issues](https://github.com/CoCreate-app/CoCreate-elements/issues) and [pull requests](https://github.com/CoCreate-app/CoCreate-elements/pulls) or merely upvote or comment on existing issues or pull requests.

We appreciate your continued support, thank you!

---

## About

CoCreate-elements is guided and supported by the CoCreate Developer Experience Team.

Please Email the Developer Experience Team [here](mailto:develop@cocreate.app) in case of any queries.

CoCreate-elements is maintained and funded by CoCreate. The names and logos for CoCreate are trademarks of CoCreate, LLC.

---

## License

This software is dual-licensed under the GNU Affero General Public License version 3 (AGPLv3) and a commercial license.

* **Open Source Use**: For open-source projects and non-commercial use, this software is available under the AGPLv3. The AGPLv3 allows you to freely use, modify, and distribute this software, provided that all modifications and derivative works are also licensed under the AGPLv3. For the full license text, see the [LICENSE file](https://github.com/CoCreate-app/CoCreate-elements/blob/master/LICENSE).

* **Commercial Use**: For-profit companies and individuals intending to use this software for commercial purposes must obtain a commercial license. The commercial license is available when you sign up for an API key on our [website](https://cocreate.app). This license permits proprietary use and modification of the software without the copyleft requirements of the AGPLv3. It is ideal for integrating this software into proprietary commercial products and applications.

If you have not purchased a commercial license and intend to use this software for commercial purposes, you are required to sign up for an API key on our website.


### Enter shortcuts for action buttons

Set `submit-query` on a form or an inner section to explicitly select the action
element Enter should click from a single-line input:

```html
<form>
    <section submit-query="#next-step">
        <input name="name" />
        <button id="next-step" type="button" actions="disabled, validate, save, disabled">Next</button>
    </section>
</form>
```

The nearest `submit-query` within the form wins. Its value uses CoCreate query
selectors, resolved from the element carrying the attribute. The resolved
target must have `actions`, belong to the same form, and be visible and enabled.
No action target is inferred when the attribute is absent. Empty or unresolved
queries, multiple returned targets, and disabled targets do not fall through to
native submission. Held Enter does not repeatedly activate the button.

Textareas, selects, editable content, input widgets, composition, modified
keystrokes, and events already handled by another listener keep their normal
keyboard behavior. This shortcut calls `.click()`; it does not submit the form
itself. Existing `action`/`method` handling remains separate, and a submit button
with `actions` can still preprocess an external submission through its chain.
