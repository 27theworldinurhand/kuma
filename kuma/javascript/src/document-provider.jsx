// @flow
import * as React from 'react';
import { useState, useEffect } from 'react';

export type DocumentData = {
    locale: string,
    slug: string,
    id: number,
    title: string,
    summary: string,
    absoluteURL: string,
    redirectURL: string,
    editURL: string,
    bodyHTML: string,
    quickLinksHTML: string,
    tocHTML: string,
    parents: Array<{ url: string, title: string }>,
    translations: Array<{
        locale: string,
        language: string,
        localizedLanguage: string,
        url: string,
        title: string
    }>,
    contributors: Array<string>,
    lastModified: string, // An ISO date
    lastModifiedBy: string,

    /*
     * The document data tells us the  locale of the document that has
     * been returned  to us. But  that is not  always the same  as the
     * locale of  the document that  the user requested. (If  the user
     * requests a Spanish  document, but we don't  have a translation,
     * the server will send us  the original english document intead.)
     * In  various places  in the  UX  we need  to link  to URLs  that
     * include a locale.  Generally, if the user is  visiting the page
     * /locale/docs/slug, then we want the  links on that page to link
     * to other pages in the  same locale. This requestLocale property
     * is intended  to refer to  that locale.  When the page  is first
     * loaded, the  window._document_data that  gets encoded  into the
     * HTML will always have this property  set. But it may not be set
     * when we  use fetch()  to query  a blob of  JSON. In  that case,
     * we'll need to add it based  on the locale of whatever URL we're
     * following.
     */
    requestLocale: string
};

const context = React.createContext<DocumentData | null>(null);

type DocumentProviderProps = {
    children: React.Node,
    initialDocumentData: DocumentData
};

export default function DocumentProvider(
    props: DocumentProviderProps
): React.Node {
    const [documentData, setDocumentData] = useState(props.initialDocumentData);

    // A one-time effect that runs only on mount, to set up
    // an event handler for client-side navigation
    useEffect(() => {
        if (!document.body) {
            throw new Error('DocumentProvider effect ran without body.');
        }
        const body = document.body;
        // This is the function that does client side navigation
        function navigate(url, localeAndSlug) {
            body.style.opacity = '0.15';
            fetch(`/api/v1/doc${localeAndSlug}`, { redirect: 'follow' })
                .then(response => {
                    if (response.ok) {
                        return response.json();
                    } else {
                        // If we didn't get a good response, throw an error
                        // that we'll handle in the catch() function below.
                        throw new Error(
                            `${response.status}:${response.statusText}`
                        );
                    }
                })
                .then(json => {
                    if (json.redirectURL) {
                        // We've got a redirect to a document that can't be
                        // handled via the /api/v1/doc/ API, so we just do a
                        // full page load of that document.
                        window.location = json.redirectURL;
                    } else {
                        let receivedLocaleAndSlug = `/${json.locale}/${
                            json.slug
                        }`;
                        if (receivedLocaleAndSlug !== localeAndSlug) {
                            // This was a redirect.
                            let receivedURL = json.absoluteURL;
                            history.replaceState(
                                { receivedURL, receivedLocaleAndSlug },
                                '',
                                receivedURL
                            );
                        }

                        // If the returned JSON does not include requestLocale
                        // then add it based on the request we just made.
                        if (!json.requestLocale) {
                            json.requestLocale = localeAndSlug.split('/')[1];
                        }

                        window.scrollTo(0, 0);
                        setDocumentData(json);
                        body.style.opacity = '1';
                    }
                })
                .catch(() => {
                    // If anything went wrong (most likely a 404 from
                    // the document API), we give up on client-side nav
                    // and just try loading the page. This might allow
                    // error recovery or will at least show the user
                    // a real 404 page.
                    window.location = url;
                });
        }

        // A click event handler that triggers client-side navigation
        body.addEventListener('click', (e: MouseEvent) => {
            // If this is not a left click, or not a single click, or
            // if there are modifier keys, then this is not a simple
            // navigation that we can do on the client side, so do nothing.
            // Also if it was not a click on an HTMLElement, do nothing.
            if (
                e.button !== 0 ||
                e.detail > 1 ||
                e.altKey ||
                e.ctrlKey ||
                e.metaKey ||
                e.shiftKey ||
                !(e.target instanceof HTMLElement)
            ) {
                return;
            }

            // Find the closest enclosing <a> element
            let link = e.target.closest('a');

            // If the link is null, or is not actually an HTMLAnchorElement
            // or it does not have an href, or if the href includes
            // a hash, or if it is an off-site link, then we can't client
            // side navigate and should just return.
            if (
                !(link instanceof HTMLAnchorElement) ||
                !link.href ||
                link.hash ||
                link.origin !== window.location.origin
            ) {
                return;
            }

            let url = link.href;
            let parts = link.pathname.split('/');
            if (parts[2] !== 'docs') {
                return;
            }

            e.preventDefault();

            let locale = parts[1];
            let slug = parts.slice(3).join('/');
            let localeAndSlug = `/${locale}/${slug}`;
            history.pushState({ url, localeAndSlug }, '', url);
            navigate(url, localeAndSlug);
        });

        // An event handler that does client-side navigation in response
        // to the back and forward buttons
        window.addEventListener('popstate', event => {
            if (event.state) {
                navigate(event.state.url, event.state.localeAndSlug);
            }
        });

        // Finally, after registering those event handlers, we also need
        // to use history.pushState() to record the URL of the initial page
        // that just loaded so that the user can return to it via the
        // back button.
        history.pushState(
            {
                url: window.location.href,
                localeAndSlug: window.location.pathname.replace('/docs/', '/')
            },
            '',
            window.location.href
        );
    }, []);

    return (
        <context.Provider value={documentData}>
            {props.children}
        </context.Provider>
    );
}

DocumentProvider.context = context;
