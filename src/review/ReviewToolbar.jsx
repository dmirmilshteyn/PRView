export default function ReviewToolbar({ onQueryChange, query, totalCount, visibleCount }) {
  return (
    <div className="review-toolbar">
      <label>
        <span>Filter changed files</span>
        <input
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Search by path…"
          type="search"
          value={query}
        />
      </label>
      <span aria-live="polite" className="review-filter-count">
        Showing {visibleCount} of {totalCount}
      </span>
      <button disabled={!query} onClick={() => onQueryChange("")} type="button">
        Clear
      </button>
    </div>
  );
}
