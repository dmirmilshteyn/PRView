export function filterPullRequests(items, filters) {
  const query = filters.query.trim().toLowerCase().replace(/^#/, "");
  return items.filter((pr) => (!query || `${pr.number} ${pr.title} ${pr.author ?? ""}`.toLowerCase().includes(query))
    && (!filters.author || pr.author === filters.author)
    && (!filters.label || pr.labels?.includes(filters.label))
    && (!filters.ci || pr.ci === filters.ci)
    && (!filters.conflicts || pr.mergeConflict === true));
}
