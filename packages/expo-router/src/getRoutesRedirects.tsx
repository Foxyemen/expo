import * as Linking from 'expo-linking';
import { createElement } from 'react';

import { cleanPath } from './fork/getStateFromPath-forks';
import { RedirectConfig } from './getRoutesCore';
import type { StoreRedirects } from './global-state/router-store';
import { matchDynamicName } from './matchers';

export function applyRedirects(
  url: string | null | undefined,
  redirects: StoreRedirects[] | undefined
): string | undefined | null {
  if (typeof url !== 'string' || !redirects) {
    return url;
  }

  const nextUrl = cleanPath(url);
  const redirect = redirects.find(([regex]) => regex.test(nextUrl));

  if (!redirect) {
    return url;
  }

  // If the redirect is external, open the URL
  if (redirect[2]) {
    let href = redirect[1].destination;
    if (href.startsWith('//') && process.env.EXPO_OS !== 'web') {
      href = `https:${href}`;
    }

    Linking.openURL(href);
    return href;
  }

  return applyRedirects(convertRedirect(url, redirect[1]), redirects);
}

export function getRedirectModule(route: string) {
  return {
    default: function RedirectComponent() {
      // Use the store directly instead of useGlobalSearchParams.
      // Importing the hooks directly causes build errors on the server
      const params = require('./hooks').useGlobalSearchParams();

      // Replace dynamic parts of the route with the actual values from the params
      let href = route
        .split('/')
        .map((part) => {
          const dynamicName = matchDynamicName(part);
          if (!dynamicName) {
            return part;
          } else {
            const param = params[dynamicName.name];
            delete params[dynamicName.name];
            return param;
          }
        })
        .filter(Boolean)
        .join('/');

      // Add any remaining params as query string
      const queryString = new URLSearchParams(params as Record<string, any>).toString();

      if (queryString) {
        href += `?${queryString}`;
      }

      return createElement(require('./link/Link').Redirect, { href });
    },
  };
}

export function convertRedirect(path: string, config: RedirectConfig) {
  const params: Record<string, string | string[]> = {};

  const parts = path.split('/');
  const sourceParts = config.source.split('/');

  for (const [index, sourcePart] of sourceParts.entries()) {
    const dynamicName = matchDynamicName(sourcePart);
    if (!dynamicName) {
      continue;
    } else if (!dynamicName.deep) {
      params[dynamicName.name] = parts[index];
      continue;
    } else {
      params[dynamicName.name] = parts.slice(index);
      break;
    }
  }

  return mergeVariablesWithPath(config.destination, params);
}

export function mergeVariablesWithPath(path: string, params: Record<string, string | string[]>) {
  return path
    .split('/')
    .map((part) => {
      const dynamicName = matchDynamicName(part);
      if (!dynamicName) {
        return part;
      } else {
        const param = params[dynamicName.name];
        delete params[dynamicName.name];
        return param;
      }
    })
    .filter(Boolean)
    .join('/');
}
