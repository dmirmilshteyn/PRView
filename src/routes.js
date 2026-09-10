export function repositoryUrl(repository) {
  return `/${repository}`;
}

export function pullsUrl(repository) {
  return `${repositoryUrl(repository)}/pulls`;
}

export function pullUrl(repository, number) {
  return `${repositoryUrl(repository)}/pull/${number}`;
}

export function parseRepositoryRoute(segments) {
  if (![2, 3, 4].includes(segments.length)) {
    return null;
  }
  if (segments.slice(0, 2).some((part) => !/^[\w.-]+$/.test(part) || part === "." || part === "..")) {
    return null;
  }
  const repository = segments.slice(0, 2).join("/");
  if (segments.length === 2) {
    return { repository, page: "dashboard", number: null };
  }
  if (segments.length === 3 && segments[2] === "pulls") {
    return { repository, page: "pulls", number: null };
  }
  if (segments.length === 4 && segments[2] === "pull" && /^[1-9]\d*$/.test(segments[3]) && Number.isSafeInteger(Number(segments[3]))) {
    return { repository, page: "pull", number: segments[3] };
  }
  return null;
}
