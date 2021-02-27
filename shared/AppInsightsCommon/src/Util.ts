// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { StorageType } from "./Enums";
import {
    _InternalMessageId, LoggingSeverity, IDiagnosticLogger, IPlugin, CoreUtils,
    getGlobal, getGlobalInst, getDocument, getNavigator, getPerformance, getLocation,
    getExceptionName as coreGetExceptionName, dumpObj, objForEachKey, strEndsWith,
    isString, isNullOrUndefined, disableCookies as coreDisableCookies, strTrim, 
    random32, isArray, isError, isDate, newId, generateW3CId, toISOString, arrForEach, getIEVersion,
    attachEvent, dateNow
} from "@microsoft/applicationinsights-core-js";
import { RequestHeaders } from "./RequestResponseHeaders";
import { DataSanitizer } from "./Telemetry/Common/DataSanitizer";
import { ICorrelationConfig } from "./Interfaces/ICorrelationConfig";
import { createDomEvent } from './DomHelperFuncs';
import { stringToBoolOrDefault, msToTimeSpan } from "./HelperFuncs";

let _navigator = getNavigator();
let _uaDisallowsSameSiteNone: boolean = null;

export class Util {
    private static document: any = getDocument() || {};
    private static _canUseLocalStorage: boolean = undefined;
    private static _canUseSessionStorage: boolean = undefined;
    // listing only non-geo specific locations
    private static _internalEndpoints: string[] = [
        "https://dc.services.visualstudio.com/v2/track",
        "https://breeze.aimon.applicationinsights.io/v2/track",
        "https://dc-int.services.visualstudio.com/v2/track"
    ];
    public static NotSpecified = "not_specified";

    public static createDomEvent = createDomEvent;

    /*
     * Force the SDK not to use local and session storage
    */
    public static disableStorage() {
        Util._canUseLocalStorage = false;
        Util._canUseSessionStorage = false;
    }

    /**
     * Gets the localStorage object if available
     * @return {Storage} - Returns the storage object if available else returns null
     */
    private static _getLocalStorageObject(): Storage {
        if (Util.canUseLocalStorage()) {
            return Util._getVerifiedStorageObject(StorageType.LocalStorage);
        }

        return null;
    }

    /**
     * Tests storage object (localStorage or sessionStorage) to verify that it is usable
     * More details here: https://mathiasbynens.be/notes/localstorage-pattern
     * @param storageType Type of storage
     * @return {Storage} Returns storage object verified that it is usable
     */
    private static _getVerifiedStorageObject(storageType: StorageType): Storage {
        let storage: Storage = null;
        let fail: boolean;
        let uid: Date;
        try {
            if (isNullOrUndefined(getGlobal())) {
                return null;
            }
            uid = new Date;
            storage = storageType === StorageType.LocalStorage ? getGlobalInst("localStorage") : getGlobalInst("sessionStorage");
            storage.setItem(uid.toString(), uid.toString());
            fail = storage.getItem(uid.toString()) !== uid.toString();
            storage.removeItem(uid.toString());
            if (fail) {
                storage = null;
            }
        } catch (exception) {
            storage = null;
        }

        return storage;
    }

    /**
     *  Checks if endpoint URL is application insights internal injestion service URL.
     *
     *  @param endpointUrl Endpoint URL to check.
     *  @returns {boolean} True if if endpoint URL is application insights internal injestion service URL.
     */
    public static isInternalApplicationInsightsEndpoint(endpointUrl: string): boolean {
        return Util._internalEndpoints.indexOf(endpointUrl.toLowerCase()) !== -1;
    }

    /**
     *  Check if the browser supports local storage.
     *
     *  @returns {boolean} True if local storage is supported.
     */
    public static canUseLocalStorage(): boolean {
        if (Util._canUseLocalStorage === undefined) {
            Util._canUseLocalStorage = !!Util._getVerifiedStorageObject(StorageType.LocalStorage);
        }

        return Util._canUseLocalStorage;
    }

    /**
     *  Get an object from the browser's local storage
     *
     *  @param {string} name - the name of the object to get from storage
     *  @returns {string} The contents of the storage object with the given name. Null if storage is not supported.
     */
    public static getStorage(logger: IDiagnosticLogger, name: string): string {
        const storage = Util._getLocalStorageObject();
        if (storage !== null) {
            try {
                return storage.getItem(name);
            } catch (e) {
                Util._canUseLocalStorage = false;

                logger.throwInternal(
                    LoggingSeverity.WARNING,
                    _InternalMessageId.BrowserCannotReadLocalStorage,
                    "Browser failed read of local storage. " + coreGetExceptionName(e),
                    { exception: dumpObj(e) });
            }
        }
        return null;
    }

    /**
     *  Set the contents of an object in the browser's local storage
     *
     *  @param {string} name - the name of the object to set in storage
     *  @param {string} data - the contents of the object to set in storage
     *  @returns {boolean} True if the storage object could be written.
     */
    public static setStorage(logger: IDiagnosticLogger, name: string, data: string): boolean {
        const storage = Util._getLocalStorageObject();
        if (storage !== null) {
            try {
                storage.setItem(name, data);
                return true;
            } catch (e) {
                Util._canUseLocalStorage = false;

                logger.throwInternal(
                    LoggingSeverity.WARNING,
                    _InternalMessageId.BrowserCannotWriteLocalStorage,
                    "Browser failed write to local storage. " + coreGetExceptionName(e),
                    { exception: dumpObj(e) });
            }
        }
        return false;
    }

    /**
     *  Remove an object from the browser's local storage
     *
     *  @param {string} name - the name of the object to remove from storage
     *  @returns {boolean} True if the storage object could be removed.
     */
    public static removeStorage(logger: IDiagnosticLogger, name: string): boolean {
        const storage = Util._getLocalStorageObject();
        if (storage !== null) {
            try {
                storage.removeItem(name);
                return true;
            } catch (e) {
                Util._canUseLocalStorage = false;

                logger.throwInternal(
                    LoggingSeverity.WARNING,
                    _InternalMessageId.BrowserFailedRemovalFromLocalStorage,
                    "Browser failed removal of local storage item. " + coreGetExceptionName(e),
                    { exception: dumpObj(e) });
            }
        }
        return false;
    }

    /**
     * Gets the sessionStorage object if available
     * @return {Storage} - Returns the storage object if available else returns null
     */
    private static _getSessionStorageObject(): Storage {
        if (Util.canUseSessionStorage()) {
            return Util._getVerifiedStorageObject(StorageType.SessionStorage);
        }

        return null;
    }

    /**
     *  Check if the browser supports session storage.
     *
     *  @returns {boolean} True if session storage is supported.
     */
    public static canUseSessionStorage(): boolean {
        if (Util._canUseSessionStorage === undefined) {
            Util._canUseSessionStorage = !!Util._getVerifiedStorageObject(StorageType.SessionStorage);
        }

        return Util._canUseSessionStorage;
    }

    /**
     *  Gets the list of session storage keys
     *
     *  @returns {string[]} List of session storage keys
     */
    public static getSessionStorageKeys(): string[] {
        const keys: string[] = [];

        if (Util.canUseSessionStorage()) {
            objForEachKey(getGlobalInst<any>("sessionStorage"), (key) => {
                keys.push(key);
            });
        }

        return keys;
    }

    /**
     *  Get an object from the browser's session storage
     *
     *  @param {string} name - the name of the object to get from storage
     *  @returns {string} The contents of the storage object with the given name. Null if storage is not supported.
     */
    public static getSessionStorage(logger: IDiagnosticLogger, name: string): string {
        const storage = Util._getSessionStorageObject();
        if (storage !== null) {
            try {
                return storage.getItem(name);
            } catch (e) {
                Util._canUseSessionStorage = false;

                logger.throwInternal(
                    LoggingSeverity.WARNING,
                    _InternalMessageId.BrowserCannotReadSessionStorage,
                    "Browser failed read of session storage. " + coreGetExceptionName(e),
                    { exception: dumpObj(e) });
            }
        }
        return null;
    }

    /**
     *  Set the contents of an object in the browser's session storage
     *
     *  @param {string} name - the name of the object to set in storage
     *  @param {string} data - the contents of the object to set in storage
     *  @returns {boolean} True if the storage object could be written.
     */
    public static setSessionStorage(logger: IDiagnosticLogger, name: string, data: string): boolean {
        const storage = Util._getSessionStorageObject();
        if (storage !== null) {
            try {
                storage.setItem(name, data);
                return true;
            } catch (e) {
                Util._canUseSessionStorage = false;

                logger.throwInternal(
                    LoggingSeverity.WARNING,
                    _InternalMessageId.BrowserCannotWriteSessionStorage,
                    "Browser failed write to session storage. " + coreGetExceptionName(e),
                    { exception: dumpObj(e) });
            }
        }
        return false;
    }

    /**
     *  Remove an object from the browser's session storage
     *
     *  @param {string} name - the name of the object to remove from storage
     *  @returns {boolean} True if the storage object could be removed.
     */
    public static removeSessionStorage(logger: IDiagnosticLogger, name: string): boolean {
        const storage = Util._getSessionStorageObject();
        if (storage !== null) {
            try {
                storage.removeItem(name);
                return true;
            } catch (e) {
                Util._canUseSessionStorage = false;

                logger.throwInternal(
                    LoggingSeverity.WARNING,
                    _InternalMessageId.BrowserFailedRemovalFromSessionStorage,
                    "Browser failed removal of session storage item. " + coreGetExceptionName(e),
                    { exception: dumpObj(e) });
            }
        }
        return false;
    }

    /*
     * Force the SDK not to store and read any data from cookies
     */
    public static disableCookies() {
        coreDisableCookies();
    }

    /*
     * helper method to tell if document.cookie object is available
     */
    public static canUseCookies(logger: IDiagnosticLogger): any {
        if (CoreUtils._canUseCookies === undefined) {
            CoreUtils._canUseCookies = false;

            try {
                CoreUtils._canUseCookies = Util.document.cookie !== undefined;
            } catch (e) {
                logger.throwInternal(
                    LoggingSeverity.WARNING,
                    _InternalMessageId.CannotAccessCookie,
                    "Cannot access document.cookie - " + Util.getExceptionName(e),
                    { exception: Util.dump(e) });
            };
        }

        return CoreUtils._canUseCookies;
    }

    public static disallowsSameSiteNone(userAgent: string) {
        if (!isString(userAgent)) {
            return false;
        }

        // Cover all iOS based browsers here. This includes:
        // - Safari on iOS 12 for iPhone, iPod Touch, iPad
        // - WkWebview on iOS 12 for iPhone, iPod Touch, iPad
        // - Chrome on iOS 12 for iPhone, iPod Touch, iPad
        // All of which are broken by SameSite=None, because they use the iOS networking stack
        if (userAgent.indexOf("CPU iPhone OS 12") !== -1 || userAgent.indexOf("iPad; CPU OS 12") !== -1) {
            return true;
        }

        // Cover Mac OS X based browsers that use the Mac OS networking stack. This includes:
        // - Safari on Mac OS X
        // This does not include:
        // - Internal browser on Mac OS X
        // - Chrome on Mac OS X
        // - Chromium on Mac OS X
        // Because they do not use the Mac OS networking stack.
        if (userAgent.indexOf("Macintosh; Intel Mac OS X 10_14") !== -1 && userAgent.indexOf("Version/") !== -1 && userAgent.indexOf("Safari") !== -1) {
            return true;
        }

        // Cover Mac OS X internal browsers that use the Mac OS networking stack. This includes:
        // - Internal browser on Mac OS X
        // This does not include:
        // - Safari on Mac OS X
        // - Chrome on Mac OS X
        // - Chromium on Mac OS X
        // Because they do not use the Mac OS networking stack.
        if (userAgent.indexOf("Macintosh; Intel Mac OS X 10_14") !== -1 && strEndsWith(userAgent, "AppleWebKit/605.1.15 (KHTML, like Gecko)")) {
            return true;
        }

        // Cover Chrome 50-69, because some versions are broken by SameSite=None, and none in this range require it.
        // Note: this covers some pre-Chromium Edge versions, but pre-Chromim Edge does not require SameSite=None, so this is fine.
        // Note: this regex applies to Windows, Mac OS X, and Linux, deliberately.
        if (userAgent.indexOf("Chrome/5") !== -1 || userAgent.indexOf("Chrome/6") !== -1) {
            return true;
        }

        // Unreal Engine runs Chromium 59, but does not advertise as Chrome until 4.23. Treat versions of Unreal
        // that don't specify their Chrome version as lacking support for SameSite=None.
        if (userAgent.indexOf("UnrealEngine") !== -1 && userAgent.indexOf("Chrome") === -1) {
            return true;
        }

        // UCBrowser < 12.13.2 ignores Set-Cookie headers with SameSite=None
        // NB: this rule isn't complete - you need regex to make a complete rule.
        // See: https://www.chromium.org/updates/same-site/incompatible-clients
        if (userAgent.indexOf("UCBrowser/12") !== -1 || userAgent.indexOf("UCBrowser/11") !== -1) {
            return true;
        }

        return false;
    }

    /**
     * helper method to set userId and sessionId cookie
     */
    public static setCookie(logger: IDiagnosticLogger, name: string, value: string, domain?: string) {
        if (Util.canUseCookies(logger)) {
            let domainAttrib = "";
            let secureAttrib = "";

            if (domain) {
                domainAttrib = ";domain=" + domain;
            }

            let location = getLocation();
            if (location && location.protocol === "https:") {
                secureAttrib = ";secure";
                if (_uaDisallowsSameSiteNone === null) {
                    _uaDisallowsSameSiteNone = Util.disallowsSameSiteNone((getNavigator() || {} as Navigator).userAgent);
                }

                if (!_uaDisallowsSameSiteNone) {
                    value = value + ";SameSite=None"; // SameSite can only be set on secure pages
                }
            }

            Util.document.cookie = name + "=" + value + domainAttrib + ";path=/" + secureAttrib;
        }
    }

    public static stringToBoolOrDefault = stringToBoolOrDefault;

    /**
     * helper method to access userId and sessionId cookie
     */
    public static getCookie(logger: IDiagnosticLogger, name: string) {
        if (!Util.canUseCookies(logger)) {
            return;
        }

        let value = "";
        if (name && name.length) {
            const cookieName = name + "=";
            const cookies = Util.document.cookie.split(";");
            for (let i = 0; i < cookies.length; i++) {
                let cookie = cookies[i];
                cookie = Util.trim(cookie);
                if (cookie && cookie.indexOf(cookieName) === 0) {
                    value = cookie.substring(cookieName.length, cookies[i].length);
                    break;
                }
            }
        }

        return value;
    }

    /**
     * Deletes a cookie by setting it's expiration time in the past.
     * @param name - The name of the cookie to delete.
     */
    public static deleteCookie(logger: IDiagnosticLogger, name: string) {
        if (Util.canUseCookies(logger)) {
            // Setting the expiration date in the past immediately removes the cookie
            Util.document.cookie = name + "=;path=/;expires=Thu, 01 Jan 1970 00:00:01 GMT;";
        }
    }

    /**
     * helper method to trim strings (IE8 does not implement String.prototype.trim)
     */
    public static trim = strTrim;

    /**
     * generate random id string
     */
    public static newId = newId;

    /**
     * generate a random 32bit number (-0x80000000..0x7FFFFFFF).
     */
    public static random32() {
        return random32(true);
    }

    /**
     * generate W3C trace id
     */
    public static generateW3CId = generateW3CId;

    /**
     * Check if an object is of type Array
     */
    public static isArray = isArray;

    /**
     * Check if an object is of type Error
     */
    public static isError = isError;

    /**
     * Check if an object is of type Date
     */
    public static isDate = isDate;

    // Keeping this name for backward compatibility (for now)
    public static toISOStringForIE8 = toISOString;

    /**
     * Gets IE version returning the document emulation mode if we are running on IE, or null otherwise
     */
    public static getIEVersion = getIEVersion;

    /**
     * Convert ms to c# time span format
     */
    public static msToTimeSpan = msToTimeSpan;

    /**
     * Checks if error has no meaningful data inside. Ususally such errors are received by window.onerror when error
     * happens in a script from other domain (cross origin, CORS).
     */
    public static isCrossOriginError(message: string|Event, url: string, lineNumber: number, columnNumber: number, error: Error): boolean {
        return !error && isString(message) && (message === "Script error." || message === "Script error");
    }

    /**
     * Returns string representation of an object suitable for diagnostics logging.
     */
    public static dump = dumpObj;

    /**
     * Returns the name of object if it's an Error. Otherwise, returns empty string.
     */
    public static getExceptionName = coreGetExceptionName;

    /**
     * Adds an event handler for the specified event to the window
     * @param eventName {string} - The name of the event
     * @param callback {any} - The callback function that needs to be executed for the given event
     * @return {boolean} - true if the handler was successfully added
     */
    public static addEventHandler = attachEvent;

    /**
     * Tells if a browser supports a Beacon API
     */
    public static IsBeaconApiSupported(): boolean {
        return ('sendBeacon' in _navigator && (_navigator as any).sendBeacon);
    }

    public static getExtension(extensions: IPlugin[], identifier: string) {
        let extension = null;
        let extIx = 0;

        while (!extension && extIx < extensions.length) {
            if (extensions[extIx] && extensions[extIx].identifier === identifier) {
                extension = extensions[extIx];
            }
            extIx++;
        }

        return extension;
    }
}

export class UrlHelper {
    private static document: any = getDocument() || {};

    private static _htmlAnchorIdx: number = 0;
    // Use an array of temporary values as it's possible for multiple calls to parseUrl() will be called with different URLs
    // Using a cache size of 5 for now as it current depth usage is at least 2, so adding a minor buffer to handle future updates
    private static _htmlAnchorElement: HTMLAnchorElement[] = [null, null, null, null, null];

    public static parseUrl(url: string): HTMLAnchorElement {
        let anchorIdx = UrlHelper._htmlAnchorIdx;
        let anchorCache = UrlHelper._htmlAnchorElement;
        let tempAnchor = anchorCache[anchorIdx];
        if (!UrlHelper.document.createElement) {
            // Always create the temp instance if createElement is not available
            tempAnchor = { host: UrlHelper.parseHost(url, true) } as HTMLAnchorElement;
        } else if (!anchorCache[anchorIdx]) {
            // Create and cache the unattached anchor instance 
            tempAnchor = anchorCache[anchorIdx] = UrlHelper.document.createElement('a');
        }

        tempAnchor.href = url;

        // Move the cache index forward
        anchorIdx++;
        if (anchorIdx >= anchorCache.length) {
            anchorIdx = 0;
        }

        UrlHelper._htmlAnchorIdx = anchorIdx;

        return tempAnchor;
    }

    public static getAbsoluteUrl(url: string): string {
        let result: string;
        const a = UrlHelper.parseUrl(url);
        if (a) {
            result = a.href;
        }

        return result;
    }

    public static getPathName(url: string): string {
        let result: string;
        const a = UrlHelper.parseUrl(url);
        if (a) {
            result = a.pathname;
        }

        return result;
    }

    public static getCompleteUrl(method: string, absoluteUrl: string) {
        if (method) {
            return method.toUpperCase() + " " + absoluteUrl;
        } else {
            return absoluteUrl;
        }
    }

    // Fallback method to grab host from url if document.createElement method is not available
    public static parseHost(url: string, inclPort?: boolean) {
        let fullHost = UrlHelper.parseFullHost(url, inclPort);
        if (fullHost) {
            const match = fullHost.match(/(www[0-9]?\.)?(.[^/:]+)(\:[\d]+)?/i);
            if (match != null && match.length > 3 && isString(match[2]) && match[2].length > 0) {
                return match[2] + (match[3] || "");
            }
        }

        return fullHost;
    }

    /**
     * Get the full host from the url, optionally including the port
     */
    public static parseFullHost(url: string, inclPort?: boolean) {
        let result = null;
        if (url) {
            const match = url.match(/(\w*):\/\/(.[^/:]+)(\:[\d]+)?/i);
            if (match != null && match.length > 2 && isString(match[2]) && match[2].length > 0) {
                result = match[2] || "";
                if (inclPort && match.length > 2) {
                    const protocol = (match[1] || "").toLowerCase();
                    let port = match[3] || "";
                    // IE includes the standard port so pass it off if it's the same as the protocol
                    if (protocol === "http" && port === ":80") {
                        port = "";
                    } else if (protocol === "https" && port === ":443") {
                        port = "";
                    }

                    result += port;
                }
            }
        }

        return result;
    }
}

export class CorrelationIdHelper {
    public static correlationIdPrefix = "cid-v1:";

    /**
     * Checks if a request url is not on a excluded domain list and if it is safe to add correlation headers.
     * Headers are always included if the current domain matches the request domain. If they do not match (CORS),
     * they are regex-ed across correlationHeaderDomains and correlationHeaderExcludedDomains to determine if headers are included.
     * Some environments don't give information on currentHost via window.location.host (e.g. Cordova). In these cases, the user must
     * manually supply domains to include correlation headers on. Else, no headers will be included at all.
     */
    public static canIncludeCorrelationHeader(config: ICorrelationConfig, requestUrl: string, currentHost?: string) {
        if (!requestUrl || (config && config.disableCorrelationHeaders)) {
            return false;
        }

        if (config && config.correlationHeaderExcludePatterns) {
            for (let i = 0; i < config.correlationHeaderExcludePatterns.length; i++) {
                if (config.correlationHeaderExcludePatterns[i].test(requestUrl)) {
                    return false;
                }
            }
        }

        let requestHost = UrlHelper.parseUrl(requestUrl).host.toLowerCase();
        if (requestHost && (requestHost.indexOf(":443") !== -1 || requestHost.indexOf(":80") !== -1)) {
            // [Bug #1260] IE can include the port even for http and https URLs so if present 
            // try and parse it to remove if it matches the default protocol port
            requestHost = (UrlHelper.parseFullHost(requestUrl, true) || "").toLowerCase();
        }

        if ((!config || !config.enableCorsCorrelation) && requestHost !== currentHost) {
            return false;
        }

        const includedDomains = config && config.correlationHeaderDomains;
        if (includedDomains) {
            let matchExists: boolean;
            arrForEach(includedDomains, (domain) => {
                const regex = new RegExp(domain.toLowerCase().replace(/\./g, "\.").replace(/\*/g, ".*"));
                matchExists = matchExists || regex.test(requestHost);
            });

            if (!matchExists) {
                return false;
            }
        }

        const excludedDomains = config && config.correlationHeaderExcludedDomains;
        if (!excludedDomains || excludedDomains.length === 0) {
            return true;
        }

        for (let i = 0; i < excludedDomains.length; i++) {
            const regex = new RegExp(excludedDomains[i].toLowerCase().replace(/\./g, "\.").replace(/\*/g, ".*"));
            if (regex.test(requestHost)) {
                return false;
            }
        }

        // if we don't know anything about the requestHost, require the user to use included/excludedDomains.
        // Previously we always returned false for a falsy requestHost
        return requestHost && requestHost.length > 0;
    }

    /**
     * Combines target appId and target role name from response header.
     */
    public static getCorrelationContext(responseHeader: string) {
        if (responseHeader) {
            const correlationId = CorrelationIdHelper.getCorrelationContextValue(responseHeader, RequestHeaders.requestContextTargetKey);
            if (correlationId && correlationId !== CorrelationIdHelper.correlationIdPrefix) {
                return correlationId;
            }
        }
    }

    /**
     * Gets key from correlation response header
     */
    public static getCorrelationContextValue(responseHeader: string, key: string) {
        if (responseHeader) {
            const keyValues = responseHeader.split(",");
            for (let i = 0; i < keyValues.length; ++i) {
                const keyValue = keyValues[i].split("=");
                if (keyValue.length === 2 && keyValue[0] === key) {
                    return keyValue[1];
                }
            }
        }
    }
}

export class AjaxHelper {
    public static ParseDependencyPath(logger: IDiagnosticLogger, absoluteUrl: string, method: string, commandName: string, customData: string) {
        let target, name = commandName, data = customData || commandName;

        if (absoluteUrl && absoluteUrl.length > 0) {
            const parsedUrl: HTMLAnchorElement = UrlHelper.parseUrl(absoluteUrl)
            target = parsedUrl.host;
            if (!name) {
                if (parsedUrl.pathname != null) {
                    let pathName: string = (parsedUrl.pathname.length === 0) ? "/" : parsedUrl.pathname;
                    if (pathName.charAt(0) !== '/') {
                        pathName = "/" + pathName;
                    }
                    data = parsedUrl.pathname;
                    name = DataSanitizer.sanitizeString(logger, method ? method + " " + pathName : pathName);
                } else {
                    name = DataSanitizer.sanitizeString(logger, absoluteUrl);
                }
            }
        } else {
            target = commandName;
            name = commandName;
        }

        return {
            target,
            name,
            data
        };
    }
}


export function dateTimeUtilsNow() {
    // returns the window or webworker performance object
    let perf = getPerformance();
    if (perf && perf.now && perf.timing) {
        let now = perf.now() + perf.timing.navigationStart;
        // Known issue with IE where this calculation can be negative, so if it is then ignore and fallback
        if (now > 0) {
            return now;
        }
    }

    return dateNow();
}

export function dateTimeUtilsDuration(start: number, end: number): number {
    let result = null;
    if (start !== 0 && end !== 0 && !isNullOrUndefined(start) && !isNullOrUndefined(end)) {
        result = end - start;
    }

    return result;
}

export interface IDateTimeUtils {
    /**
     * Get the number of milliseconds since 1970/01/01 in local timezone
     */
    Now: () => number;

    /**
     * Gets duration between two timestamps
     */
    GetDuration: (start: number, end: number) => number;
}

/**
 * A utility class that helps getting time related parameters
 */
export const DateTimeUtils: IDateTimeUtils = (function() {
    return {
        Now: dateTimeUtilsNow,
        GetDuration: dateTimeUtilsDuration
    };
})();
