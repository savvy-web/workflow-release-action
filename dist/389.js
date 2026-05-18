export const __rspack_esm_id = 389;
export const __rspack_esm_ids = [389];
export const __webpack_modules__ = {
97859(__unused_rspack_module, exports) {
var __webpack_unused_export__;

__webpack_unused_export__ = ({ value: true });
exports.formatNames = exports.fastFormats = exports.fullFormats = void 0;
function fmtDef(validate, compare) {
    return { validate, compare };
}
exports.fullFormats = {
    // date: http://tools.ietf.org/html/rfc3339#section-5.6
    date: fmtDef(date, compareDate),
    // date-time: http://tools.ietf.org/html/rfc3339#section-5.6
    time: fmtDef(getTime(true), compareTime),
    "date-time": fmtDef(getDateTime(true), compareDateTime),
    "iso-time": fmtDef(getTime(), compareIsoTime),
    "iso-date-time": fmtDef(getDateTime(), compareIsoDateTime),
    // duration: https://tools.ietf.org/html/rfc3339#appendix-A
    duration: /^P(?!$)((\d+Y)?(\d+M)?(\d+D)?(T(?=\d)(\d+H)?(\d+M)?(\d+S)?)?|(\d+W)?)$/,
    uri,
    "uri-reference": /^(?:[a-z][a-z0-9+\-.]*:)?(?:\/?\/(?:(?:[a-z0-9\-._~!$&'()*+,;=:]|%[0-9a-f]{2})*@)?(?:\[(?:(?:(?:(?:[0-9a-f]{1,4}:){6}|::(?:[0-9a-f]{1,4}:){5}|(?:[0-9a-f]{1,4})?::(?:[0-9a-f]{1,4}:){4}|(?:(?:[0-9a-f]{1,4}:){0,1}[0-9a-f]{1,4})?::(?:[0-9a-f]{1,4}:){3}|(?:(?:[0-9a-f]{1,4}:){0,2}[0-9a-f]{1,4})?::(?:[0-9a-f]{1,4}:){2}|(?:(?:[0-9a-f]{1,4}:){0,3}[0-9a-f]{1,4})?::[0-9a-f]{1,4}:|(?:(?:[0-9a-f]{1,4}:){0,4}[0-9a-f]{1,4})?::)(?:[0-9a-f]{1,4}:[0-9a-f]{1,4}|(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?))|(?:(?:[0-9a-f]{1,4}:){0,5}[0-9a-f]{1,4})?::[0-9a-f]{1,4}|(?:(?:[0-9a-f]{1,4}:){0,6}[0-9a-f]{1,4})?::)|[Vv][0-9a-f]+\.[a-z0-9\-._~!$&'()*+,;=:]+)\]|(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)|(?:[a-z0-9\-._~!$&'"()*+,;=]|%[0-9a-f]{2})*)(?::\d*)?(?:\/(?:[a-z0-9\-._~!$&'"()*+,;=:@]|%[0-9a-f]{2})*)*|\/(?:(?:[a-z0-9\-._~!$&'"()*+,;=:@]|%[0-9a-f]{2})+(?:\/(?:[a-z0-9\-._~!$&'"()*+,;=:@]|%[0-9a-f]{2})*)*)?|(?:[a-z0-9\-._~!$&'"()*+,;=:@]|%[0-9a-f]{2})+(?:\/(?:[a-z0-9\-._~!$&'"()*+,;=:@]|%[0-9a-f]{2})*)*)?(?:\?(?:[a-z0-9\-._~!$&'"()*+,;=:@/?]|%[0-9a-f]{2})*)?(?:#(?:[a-z0-9\-._~!$&'"()*+,;=:@/?]|%[0-9a-f]{2})*)?$/i,
    // uri-template: https://tools.ietf.org/html/rfc6570
    "uri-template": /^(?:(?:[^\x00-\x20"'<>%\\^`{|}]|%[0-9a-f]{2})|\{[+#./;?&=,!@|]?(?:[a-z0-9_]|%[0-9a-f]{2})+(?::[1-9][0-9]{0,3}|\*)?(?:,(?:[a-z0-9_]|%[0-9a-f]{2})+(?::[1-9][0-9]{0,3}|\*)?)*\})*$/i,
    // For the source: https://gist.github.com/dperini/729294
    // For test cases: https://mathiasbynens.be/demo/url-regex
    url: /^(?:https?|ftp):\/\/(?:\S+(?::\S*)?@)?(?:(?!(?:10|127)(?:\.\d{1,3}){3})(?!(?:169\.254|192\.168)(?:\.\d{1,3}){2})(?!172\.(?:1[6-9]|2\d|3[0-1])(?:\.\d{1,3}){2})(?:[1-9]\d?|1\d\d|2[01]\d|22[0-3])(?:\.(?:1?\d{1,2}|2[0-4]\d|25[0-5])){2}(?:\.(?:[1-9]\d?|1\d\d|2[0-4]\d|25[0-4]))|(?:(?:[a-z0-9\u{00a1}-\u{ffff}]+-)*[a-z0-9\u{00a1}-\u{ffff}]+)(?:\.(?:[a-z0-9\u{00a1}-\u{ffff}]+-)*[a-z0-9\u{00a1}-\u{ffff}]+)*(?:\.(?:[a-z\u{00a1}-\u{ffff}]{2,})))(?::\d{2,5})?(?:\/[^\s]*)?$/iu,
    email: /^[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i,
    hostname: /^(?=.{1,253}\.?$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[-0-9a-z]{0,61}[0-9a-z])?)*\.?$/i,
    // optimized https://www.safaribooksonline.com/library/view/regular-expressions-cookbook/9780596802837/ch07s16.html
    ipv4: /^(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)$/,
    ipv6: /^((([0-9a-f]{1,4}:){7}([0-9a-f]{1,4}|:))|(([0-9a-f]{1,4}:){6}(:[0-9a-f]{1,4}|((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3})|:))|(([0-9a-f]{1,4}:){5}(((:[0-9a-f]{1,4}){1,2})|:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3})|:))|(([0-9a-f]{1,4}:){4}(((:[0-9a-f]{1,4}){1,3})|((:[0-9a-f]{1,4})?:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:))|(([0-9a-f]{1,4}:){3}(((:[0-9a-f]{1,4}){1,4})|((:[0-9a-f]{1,4}){0,2}:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:))|(([0-9a-f]{1,4}:){2}(((:[0-9a-f]{1,4}){1,5})|((:[0-9a-f]{1,4}){0,3}:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:))|(([0-9a-f]{1,4}:){1}(((:[0-9a-f]{1,4}){1,6})|((:[0-9a-f]{1,4}){0,4}:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:))|(:(((:[0-9a-f]{1,4}){1,7})|((:[0-9a-f]{1,4}){0,5}:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:)))$/i,
    regex,
    // uuid: http://tools.ietf.org/html/rfc4122
    uuid: /^(?:urn:uuid:)?[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i,
    // JSON-pointer: https://tools.ietf.org/html/rfc6901
    // uri fragment: https://tools.ietf.org/html/rfc3986#appendix-A
    "json-pointer": /^(?:\/(?:[^~/]|~0|~1)*)*$/,
    "json-pointer-uri-fragment": /^#(?:\/(?:[a-z0-9_\-.!$&'()*+,;:=@]|%[0-9a-f]{2}|~0|~1)*)*$/i,
    // relative JSON-pointer: http://tools.ietf.org/html/draft-luff-relative-json-pointer-00
    "relative-json-pointer": /^(?:0|[1-9][0-9]*)(?:#|(?:\/(?:[^~/]|~0|~1)*)*)$/,
    // the following formats are used by the openapi specification: https://spec.openapis.org/oas/v3.0.0#data-types
    // byte: https://github.com/miguelmota/is-base64
    byte,
    // signed 32 bit integer
    int32: { type: "number", validate: validateInt32 },
    // signed 64 bit integer
    int64: { type: "number", validate: validateInt64 },
    // C-type float
    float: { type: "number", validate: validateNumber },
    // C-type double
    double: { type: "number", validate: validateNumber },
    // hint to the UI to hide input strings
    password: true,
    // unchecked string payload
    binary: true,
};
exports.fastFormats = {
    ...exports.fullFormats,
    date: fmtDef(/^\d\d\d\d-[0-1]\d-[0-3]\d$/, compareDate),
    time: fmtDef(/^(?:[0-2]\d:[0-5]\d:[0-5]\d|23:59:60)(?:\.\d+)?(?:z|[+-]\d\d(?::?\d\d)?)$/i, compareTime),
    "date-time": fmtDef(/^\d\d\d\d-[0-1]\d-[0-3]\dt(?:[0-2]\d:[0-5]\d:[0-5]\d|23:59:60)(?:\.\d+)?(?:z|[+-]\d\d(?::?\d\d)?)$/i, compareDateTime),
    "iso-time": fmtDef(/^(?:[0-2]\d:[0-5]\d:[0-5]\d|23:59:60)(?:\.\d+)?(?:z|[+-]\d\d(?::?\d\d)?)?$/i, compareIsoTime),
    "iso-date-time": fmtDef(/^\d\d\d\d-[0-1]\d-[0-3]\d[t\s](?:[0-2]\d:[0-5]\d:[0-5]\d|23:59:60)(?:\.\d+)?(?:z|[+-]\d\d(?::?\d\d)?)?$/i, compareIsoDateTime),
    // uri: https://github.com/mafintosh/is-my-json-valid/blob/master/formats.js
    uri: /^(?:[a-z][a-z0-9+\-.]*:)(?:\/?\/)?[^\s]*$/i,
    "uri-reference": /^(?:(?:[a-z][a-z0-9+\-.]*:)?\/?\/)?(?:[^\\\s#][^\s#]*)?(?:#[^\\\s]*)?$/i,
    // email (sources from jsen validator):
    // http://stackoverflow.com/questions/201323/using-a-regular-expression-to-validate-an-email-address#answer-8829363
    // http://www.w3.org/TR/html5/forms.html#valid-e-mail-address (search for 'wilful violation')
    email: /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/i,
};
exports.formatNames = Object.keys(exports.fullFormats);
function isLeapYear(year) {
    // https://tools.ietf.org/html/rfc3339#appendix-C
    return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}
const DATE = /^(\d\d\d\d)-(\d\d)-(\d\d)$/;
const DAYS = [0, 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
function date(str) {
    // full-date from http://tools.ietf.org/html/rfc3339#section-5.6
    const matches = DATE.exec(str);
    if (!matches)
        return false;
    const year = +matches[1];
    const month = +matches[2];
    const day = +matches[3];
    return (month >= 1 &&
        month <= 12 &&
        day >= 1 &&
        day <= (month === 2 && isLeapYear(year) ? 29 : DAYS[month]));
}
function compareDate(d1, d2) {
    if (!(d1 && d2))
        return undefined;
    if (d1 > d2)
        return 1;
    if (d1 < d2)
        return -1;
    return 0;
}
const TIME = /^(\d\d):(\d\d):(\d\d(?:\.\d+)?)(z|([+-])(\d\d)(?::?(\d\d))?)?$/i;
function getTime(strictTimeZone) {
    return function time(str) {
        const matches = TIME.exec(str);
        if (!matches)
            return false;
        const hr = +matches[1];
        const min = +matches[2];
        const sec = +matches[3];
        const tz = matches[4];
        const tzSign = matches[5] === "-" ? -1 : 1;
        const tzH = +(matches[6] || 0);
        const tzM = +(matches[7] || 0);
        if (tzH > 23 || tzM > 59 || (strictTimeZone && !tz))
            return false;
        if (hr <= 23 && min <= 59 && sec < 60)
            return true;
        // leap second
        const utcMin = min - tzM * tzSign;
        const utcHr = hr - tzH * tzSign - (utcMin < 0 ? 1 : 0);
        return (utcHr === 23 || utcHr === -1) && (utcMin === 59 || utcMin === -1) && sec < 61;
    };
}
function compareTime(s1, s2) {
    if (!(s1 && s2))
        return undefined;
    const t1 = new Date("2020-01-01T" + s1).valueOf();
    const t2 = new Date("2020-01-01T" + s2).valueOf();
    if (!(t1 && t2))
        return undefined;
    return t1 - t2;
}
function compareIsoTime(t1, t2) {
    if (!(t1 && t2))
        return undefined;
    const a1 = TIME.exec(t1);
    const a2 = TIME.exec(t2);
    if (!(a1 && a2))
        return undefined;
    t1 = a1[1] + a1[2] + a1[3];
    t2 = a2[1] + a2[2] + a2[3];
    if (t1 > t2)
        return 1;
    if (t1 < t2)
        return -1;
    return 0;
}
const DATE_TIME_SEPARATOR = /t|\s/i;
function getDateTime(strictTimeZone) {
    const time = getTime(strictTimeZone);
    return function date_time(str) {
        // http://tools.ietf.org/html/rfc3339#section-5.6
        const dateTime = str.split(DATE_TIME_SEPARATOR);
        return dateTime.length === 2 && date(dateTime[0]) && time(dateTime[1]);
    };
}
function compareDateTime(dt1, dt2) {
    if (!(dt1 && dt2))
        return undefined;
    const d1 = new Date(dt1).valueOf();
    const d2 = new Date(dt2).valueOf();
    if (!(d1 && d2))
        return undefined;
    return d1 - d2;
}
function compareIsoDateTime(dt1, dt2) {
    if (!(dt1 && dt2))
        return undefined;
    const [d1, t1] = dt1.split(DATE_TIME_SEPARATOR);
    const [d2, t2] = dt2.split(DATE_TIME_SEPARATOR);
    const res = compareDate(d1, d2);
    if (res === undefined)
        return undefined;
    return res || compareTime(t1, t2);
}
const NOT_URI_FRAGMENT = /\/|:/;
const URI = /^(?:[a-z][a-z0-9+\-.]*:)(?:\/?\/(?:(?:[a-z0-9\-._~!$&'()*+,;=:]|%[0-9a-f]{2})*@)?(?:\[(?:(?:(?:(?:[0-9a-f]{1,4}:){6}|::(?:[0-9a-f]{1,4}:){5}|(?:[0-9a-f]{1,4})?::(?:[0-9a-f]{1,4}:){4}|(?:(?:[0-9a-f]{1,4}:){0,1}[0-9a-f]{1,4})?::(?:[0-9a-f]{1,4}:){3}|(?:(?:[0-9a-f]{1,4}:){0,2}[0-9a-f]{1,4})?::(?:[0-9a-f]{1,4}:){2}|(?:(?:[0-9a-f]{1,4}:){0,3}[0-9a-f]{1,4})?::[0-9a-f]{1,4}:|(?:(?:[0-9a-f]{1,4}:){0,4}[0-9a-f]{1,4})?::)(?:[0-9a-f]{1,4}:[0-9a-f]{1,4}|(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?))|(?:(?:[0-9a-f]{1,4}:){0,5}[0-9a-f]{1,4})?::[0-9a-f]{1,4}|(?:(?:[0-9a-f]{1,4}:){0,6}[0-9a-f]{1,4})?::)|[Vv][0-9a-f]+\.[a-z0-9\-._~!$&'()*+,;=:]+)\]|(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)|(?:[a-z0-9\-._~!$&'()*+,;=]|%[0-9a-f]{2})*)(?::\d*)?(?:\/(?:[a-z0-9\-._~!$&'()*+,;=:@]|%[0-9a-f]{2})*)*|\/(?:(?:[a-z0-9\-._~!$&'()*+,;=:@]|%[0-9a-f]{2})+(?:\/(?:[a-z0-9\-._~!$&'()*+,;=:@]|%[0-9a-f]{2})*)*)?|(?:[a-z0-9\-._~!$&'()*+,;=:@]|%[0-9a-f]{2})+(?:\/(?:[a-z0-9\-._~!$&'()*+,;=:@]|%[0-9a-f]{2})*)*)(?:\?(?:[a-z0-9\-._~!$&'()*+,;=:@/?]|%[0-9a-f]{2})*)?(?:#(?:[a-z0-9\-._~!$&'()*+,;=:@/?]|%[0-9a-f]{2})*)?$/i;
function uri(str) {
    // http://jmrware.com/articles/2009/uri_regexp/URI_regex.html + optional protocol + required "."
    return NOT_URI_FRAGMENT.test(str) && URI.test(str);
}
const BYTE = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/gm;
function byte(str) {
    BYTE.lastIndex = 0;
    return BYTE.test(str);
}
const MIN_INT32 = -(2 ** 31);
const MAX_INT32 = 2 ** 31 - 1;
function validateInt32(value) {
    return Number.isInteger(value) && value <= MAX_INT32 && value >= MIN_INT32;
}
function validateInt64(value) {
    // JSON and javascript max Int is 2**53, so any int that passes isInteger is valid for Int64
    return Number.isInteger(value);
}
function validateNumber() {
    return true;
}
const Z_ANCHOR = /[^\\]\\Z/;
function regex(str) {
    if (Z_ANCHOR.test(str))
        return false;
    try {
        new RegExp(str);
        return true;
    }
    catch (e) {
        return false;
    }
}
//# sourceMappingURL=formats.js.map

},
36279(module, exports, __webpack_require__) {

Object.defineProperty(exports, "__esModule", ({ value: true }));
const formats_1 = __webpack_require__(97859);
const limit_1 = __webpack_require__(3068);
const codegen_1 = __webpack_require__(48325);
const fullName = new codegen_1.Name("fullFormats");
const fastName = new codegen_1.Name("fastFormats");
const formatsPlugin = (ajv, opts = { keywords: true }) => {
    if (Array.isArray(opts)) {
        addFormats(ajv, opts, formats_1.fullFormats, fullName);
        return ajv;
    }
    const [formats, exportName] = opts.mode === "fast" ? [formats_1.fastFormats, fastName] : [formats_1.fullFormats, fullName];
    const list = opts.formats || formats_1.formatNames;
    addFormats(ajv, list, formats, exportName);
    if (opts.keywords)
        (0, limit_1.default)(ajv);
    return ajv;
};
formatsPlugin.get = (name, mode = "full") => {
    const formats = mode === "fast" ? formats_1.fastFormats : formats_1.fullFormats;
    const f = formats[name];
    if (!f)
        throw new Error(`Unknown format "${name}"`);
    return f;
};
function addFormats(ajv, list, fs, exportName) {
    var _a;
    var _b;
    (_a = (_b = ajv.opts.code).formats) !== null && _a !== void 0 ? _a : (_b.formats = (0, codegen_1._) `require("ajv-formats/dist/formats").${exportName}`);
    for (const f of list)
        ajv.addFormat(f, fs[f]);
}
module.exports = exports = formatsPlugin;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports["default"] = formatsPlugin;
//# sourceMappingURL=index.js.map

},
3068(__unused_rspack_module, exports, __webpack_require__) {
var __webpack_unused_export__;

__webpack_unused_export__ = ({ value: true });
exports.A = void 0;
const ajv_1 = __webpack_require__(45378);
const codegen_1 = __webpack_require__(48325);
const ops = codegen_1.operators;
const KWDs = {
    formatMaximum: { okStr: "<=", ok: ops.LTE, fail: ops.GT },
    formatMinimum: { okStr: ">=", ok: ops.GTE, fail: ops.LT },
    formatExclusiveMaximum: { okStr: "<", ok: ops.LT, fail: ops.GTE },
    formatExclusiveMinimum: { okStr: ">", ok: ops.GT, fail: ops.LTE },
};
const error = {
    message: ({ keyword, schemaCode }) => (0, codegen_1.str) `should be ${KWDs[keyword].okStr} ${schemaCode}`,
    params: ({ keyword, schemaCode }) => (0, codegen_1._) `{comparison: ${KWDs[keyword].okStr}, limit: ${schemaCode}}`,
};
exports.A = {
    keyword: Object.keys(KWDs),
    type: "string",
    schemaType: "string",
    $data: true,
    error,
    code(cxt) {
        const { gen, data, schemaCode, keyword, it } = cxt;
        const { opts, self } = it;
        if (!opts.validateFormats)
            return;
        const fCxt = new ajv_1.KeywordCxt(it, self.RULES.all.format.definition, "format");
        if (fCxt.$data)
            validate$DataFormat();
        else
            validateFormat();
        function validate$DataFormat() {
            const fmts = gen.scopeValue("formats", {
                ref: self.formats,
                code: opts.code.formats,
            });
            const fmt = gen.const("fmt", (0, codegen_1._) `${fmts}[${fCxt.schemaCode}]`);
            cxt.fail$data((0, codegen_1.or)((0, codegen_1._) `typeof ${fmt} != "object"`, (0, codegen_1._) `${fmt} instanceof RegExp`, (0, codegen_1._) `typeof ${fmt}.compare != "function"`, compareCode(fmt)));
        }
        function validateFormat() {
            const format = fCxt.schema;
            const fmtDef = self.formats[format];
            if (!fmtDef || fmtDef === true)
                return;
            if (typeof fmtDef != "object" ||
                fmtDef instanceof RegExp ||
                typeof fmtDef.compare != "function") {
                throw new Error(`"${keyword}": format "${format}" does not define "compare" function`);
            }
            const fmt = gen.scopeValue("formats", {
                key: format,
                ref: fmtDef,
                code: opts.code.formats ? (0, codegen_1._) `${opts.code.formats}${(0, codegen_1.getProperty)(format)}` : undefined,
            });
            cxt.fail$data(compareCode(fmt));
        }
        function compareCode(fmt) {
            return (0, codegen_1._) `${fmt}.compare(${data}, ${schemaCode}) ${KWDs[keyword].fail} 0`;
        }
    },
    dependencies: ["format"],
};
const formatLimitPlugin = (ajv) => {
    ajv.addKeyword(exports.A);
    return ajv;
};
exports["default"] = formatLimitPlugin;
//# sourceMappingURL=limit.js.map

},
45378(module, exports, __webpack_require__) {

Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.MissingRefError = exports.ValidationError = exports.CodeGen = exports.Name = exports.nil = exports.stringify = exports.str = exports._ = exports.KeywordCxt = exports.Ajv = void 0;
const core_1 = __webpack_require__(72186);
const draft7_1 = __webpack_require__(92656);
const discriminator_1 = __webpack_require__(74717);
const draft7MetaSchema = __webpack_require__(93519);
const META_SUPPORT_DATA = ["/properties"];
const META_SCHEMA_ID = "http://json-schema.org/draft-07/schema";
class Ajv extends core_1.default {
    _addVocabularies() {
        super._addVocabularies();
        draft7_1.default.forEach((v) => this.addVocabulary(v));
        if (this.opts.discriminator)
            this.addKeyword(discriminator_1.default);
    }
    _addDefaultMetaSchema() {
        super._addDefaultMetaSchema();
        if (!this.opts.meta)
            return;
        const metaSchema = this.opts.$data
            ? this.$dataMetaSchema(draft7MetaSchema, META_SUPPORT_DATA)
            : draft7MetaSchema;
        this.addMetaSchema(metaSchema, META_SCHEMA_ID, false);
        this.refs["http://json-schema.org/schema"] = META_SCHEMA_ID;
    }
    defaultMeta() {
        return (this.opts.defaultMeta =
            super.defaultMeta() || (this.getSchema(META_SCHEMA_ID) ? META_SCHEMA_ID : undefined));
    }
}
exports.Ajv = Ajv;
module.exports = exports = Ajv;
module.exports.Ajv = Ajv;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports["default"] = Ajv;
var validate_1 = __webpack_require__(42890);
Object.defineProperty(exports, "KeywordCxt", ({ enumerable: true, get: function () { return validate_1.KeywordCxt; } }));
var codegen_1 = __webpack_require__(48325);
Object.defineProperty(exports, "_", ({ enumerable: true, get: function () { return codegen_1._; } }));
Object.defineProperty(exports, "str", ({ enumerable: true, get: function () { return codegen_1.str; } }));
Object.defineProperty(exports, "stringify", ({ enumerable: true, get: function () { return codegen_1.stringify; } }));
Object.defineProperty(exports, "nil", ({ enumerable: true, get: function () { return codegen_1.nil; } }));
Object.defineProperty(exports, "Name", ({ enumerable: true, get: function () { return codegen_1.Name; } }));
Object.defineProperty(exports, "CodeGen", ({ enumerable: true, get: function () { return codegen_1.CodeGen; } }));
var validation_error_1 = __webpack_require__(9894);
Object.defineProperty(exports, "ValidationError", ({ enumerable: true, get: function () { return validation_error_1.default; } }));
var ref_error_1 = __webpack_require__(29319);
Object.defineProperty(exports, "MissingRefError", ({ enumerable: true, get: function () { return ref_error_1.default; } }));
//# sourceMappingURL=ajv.js.map

},
57568(__unused_rspack_module, exports) {

Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.regexpCode = exports.getEsmExportName = exports.getProperty = exports.safeStringify = exports.stringify = exports.strConcat = exports.addCodeArg = exports.str = exports._ = exports.nil = exports._Code = exports.Name = exports.IDENTIFIER = exports._CodeOrName = void 0;
// eslint-disable-next-line @typescript-eslint/no-extraneous-class
class _CodeOrName {
}
exports._CodeOrName = _CodeOrName;
exports.IDENTIFIER = /^[a-z$_][a-z$_0-9]*$/i;
class Name extends _CodeOrName {
    constructor(s) {
        super();
        if (!exports.IDENTIFIER.test(s))
            throw new Error("CodeGen: name must be a valid identifier");
        this.str = s;
    }
    toString() {
        return this.str;
    }
    emptyStr() {
        return false;
    }
    get names() {
        return { [this.str]: 1 };
    }
}
exports.Name = Name;
class _Code extends _CodeOrName {
    constructor(code) {
        super();
        this._items = typeof code === "string" ? [code] : code;
    }
    toString() {
        return this.str;
    }
    emptyStr() {
        if (this._items.length > 1)
            return false;
        const item = this._items[0];
        return item === "" || item === '""';
    }
    get str() {
        var _a;
        return ((_a = this._str) !== null && _a !== void 0 ? _a : (this._str = this._items.reduce((s, c) => `${s}${c}`, "")));
    }
    get names() {
        var _a;
        return ((_a = this._names) !== null && _a !== void 0 ? _a : (this._names = this._items.reduce((names, c) => {
            if (c instanceof Name)
                names[c.str] = (names[c.str] || 0) + 1;
            return names;
        }, {})));
    }
}
exports._Code = _Code;
exports.nil = new _Code("");
function _(strs, ...args) {
    const code = [strs[0]];
    let i = 0;
    while (i < args.length) {
        addCodeArg(code, args[i]);
        code.push(strs[++i]);
    }
    return new _Code(code);
}
exports._ = _;
const plus = new _Code("+");
function str(strs, ...args) {
    const expr = [safeStringify(strs[0])];
    let i = 0;
    while (i < args.length) {
        expr.push(plus);
        addCodeArg(expr, args[i]);
        expr.push(plus, safeStringify(strs[++i]));
    }
    optimize(expr);
    return new _Code(expr);
}
exports.str = str;
function addCodeArg(code, arg) {
    if (arg instanceof _Code)
        code.push(...arg._items);
    else if (arg instanceof Name)
        code.push(arg);
    else
        code.push(interpolate(arg));
}
exports.addCodeArg = addCodeArg;
function optimize(expr) {
    let i = 1;
    while (i < expr.length - 1) {
        if (expr[i] === plus) {
            const res = mergeExprItems(expr[i - 1], expr[i + 1]);
            if (res !== undefined) {
                expr.splice(i - 1, 3, res);
                continue;
            }
            expr[i++] = "+";
        }
        i++;
    }
}
function mergeExprItems(a, b) {
    if (b === '""')
        return a;
    if (a === '""')
        return b;
    if (typeof a == "string") {
        if (b instanceof Name || a[a.length - 1] !== '"')
            return;
        if (typeof b != "string")
            return `${a.slice(0, -1)}${b}"`;
        if (b[0] === '"')
            return a.slice(0, -1) + b.slice(1);
        return;
    }
    if (typeof b == "string" && b[0] === '"' && !(a instanceof Name))
        return `"${a}${b.slice(1)}`;
    return;
}
function strConcat(c1, c2) {
    return c2.emptyStr() ? c1 : c1.emptyStr() ? c2 : str `${c1}${c2}`;
}
exports.strConcat = strConcat;
// TODO do not allow arrays here
function interpolate(x) {
    return typeof x == "number" || typeof x == "boolean" || x === null
        ? x
        : safeStringify(Array.isArray(x) ? x.join(",") : x);
}
function stringify(x) {
    return new _Code(safeStringify(x));
}
exports.stringify = stringify;
function safeStringify(x) {
    return JSON.stringify(x)
        .replace(/\u2028/g, "\\u2028")
        .replace(/\u2029/g, "\\u2029");
}
exports.safeStringify = safeStringify;
function getProperty(key) {
    return typeof key == "string" && exports.IDENTIFIER.test(key) ? new _Code(`.${key}`) : _ `[${key}]`;
}
exports.getProperty = getProperty;
//Does best effort to format the name properly
function getEsmExportName(key) {
    if (typeof key == "string" && exports.IDENTIFIER.test(key)) {
        return new _Code(`${key}`);
    }
    throw new Error(`CodeGen: invalid export name: ${key}, use explicit $id name mapping`);
}
exports.getEsmExportName = getEsmExportName;
function regexpCode(rx) {
    return new _Code(rx.toString());
}
exports.regexpCode = regexpCode;
//# sourceMappingURL=code.js.map

},
48325(__unused_rspack_module, exports, __webpack_require__) {

Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.or = exports.and = exports.not = exports.CodeGen = exports.operators = exports.varKinds = exports.ValueScopeName = exports.ValueScope = exports.Scope = exports.Name = exports.regexpCode = exports.stringify = exports.getProperty = exports.nil = exports.strConcat = exports.str = exports._ = void 0;
const code_1 = __webpack_require__(57568);
const scope_1 = __webpack_require__(37413);
var code_2 = __webpack_require__(57568);
Object.defineProperty(exports, "_", ({ enumerable: true, get: function () { return code_2._; } }));
Object.defineProperty(exports, "str", ({ enumerable: true, get: function () { return code_2.str; } }));
Object.defineProperty(exports, "strConcat", ({ enumerable: true, get: function () { return code_2.strConcat; } }));
Object.defineProperty(exports, "nil", ({ enumerable: true, get: function () { return code_2.nil; } }));
Object.defineProperty(exports, "getProperty", ({ enumerable: true, get: function () { return code_2.getProperty; } }));
Object.defineProperty(exports, "stringify", ({ enumerable: true, get: function () { return code_2.stringify; } }));
Object.defineProperty(exports, "regexpCode", ({ enumerable: true, get: function () { return code_2.regexpCode; } }));
Object.defineProperty(exports, "Name", ({ enumerable: true, get: function () { return code_2.Name; } }));
var scope_2 = __webpack_require__(37413);
Object.defineProperty(exports, "Scope", ({ enumerable: true, get: function () { return scope_2.Scope; } }));
Object.defineProperty(exports, "ValueScope", ({ enumerable: true, get: function () { return scope_2.ValueScope; } }));
Object.defineProperty(exports, "ValueScopeName", ({ enumerable: true, get: function () { return scope_2.ValueScopeName; } }));
Object.defineProperty(exports, "varKinds", ({ enumerable: true, get: function () { return scope_2.varKinds; } }));
exports.operators = {
    GT: new code_1._Code(">"),
    GTE: new code_1._Code(">="),
    LT: new code_1._Code("<"),
    LTE: new code_1._Code("<="),
    EQ: new code_1._Code("==="),
    NEQ: new code_1._Code("!=="),
    NOT: new code_1._Code("!"),
    OR: new code_1._Code("||"),
    AND: new code_1._Code("&&"),
    ADD: new code_1._Code("+"),
};
class Node {
    optimizeNodes() {
        return this;
    }
    optimizeNames(_names, _constants) {
        return this;
    }
}
class Def extends Node {
    constructor(varKind, name, rhs) {
        super();
        this.varKind = varKind;
        this.name = name;
        this.rhs = rhs;
    }
    render({ es5, _n }) {
        const varKind = es5 ? scope_1.varKinds.var : this.varKind;
        const rhs = this.rhs === undefined ? "" : ` = ${this.rhs}`;
        return `${varKind} ${this.name}${rhs};` + _n;
    }
    optimizeNames(names, constants) {
        if (!names[this.name.str])
            return;
        if (this.rhs)
            this.rhs = optimizeExpr(this.rhs, names, constants);
        return this;
    }
    get names() {
        return this.rhs instanceof code_1._CodeOrName ? this.rhs.names : {};
    }
}
class Assign extends Node {
    constructor(lhs, rhs, sideEffects) {
        super();
        this.lhs = lhs;
        this.rhs = rhs;
        this.sideEffects = sideEffects;
    }
    render({ _n }) {
        return `${this.lhs} = ${this.rhs};` + _n;
    }
    optimizeNames(names, constants) {
        if (this.lhs instanceof code_1.Name && !names[this.lhs.str] && !this.sideEffects)
            return;
        this.rhs = optimizeExpr(this.rhs, names, constants);
        return this;
    }
    get names() {
        const names = this.lhs instanceof code_1.Name ? {} : { ...this.lhs.names };
        return addExprNames(names, this.rhs);
    }
}
class AssignOp extends Assign {
    constructor(lhs, op, rhs, sideEffects) {
        super(lhs, rhs, sideEffects);
        this.op = op;
    }
    render({ _n }) {
        return `${this.lhs} ${this.op}= ${this.rhs};` + _n;
    }
}
class Label extends Node {
    constructor(label) {
        super();
        this.label = label;
        this.names = {};
    }
    render({ _n }) {
        return `${this.label}:` + _n;
    }
}
class Break extends Node {
    constructor(label) {
        super();
        this.label = label;
        this.names = {};
    }
    render({ _n }) {
        const label = this.label ? ` ${this.label}` : "";
        return `break${label};` + _n;
    }
}
class Throw extends Node {
    constructor(error) {
        super();
        this.error = error;
    }
    render({ _n }) {
        return `throw ${this.error};` + _n;
    }
    get names() {
        return this.error.names;
    }
}
class AnyCode extends Node {
    constructor(code) {
        super();
        this.code = code;
    }
    render({ _n }) {
        return `${this.code};` + _n;
    }
    optimizeNodes() {
        return `${this.code}` ? this : undefined;
    }
    optimizeNames(names, constants) {
        this.code = optimizeExpr(this.code, names, constants);
        return this;
    }
    get names() {
        return this.code instanceof code_1._CodeOrName ? this.code.names : {};
    }
}
class ParentNode extends Node {
    constructor(nodes = []) {
        super();
        this.nodes = nodes;
    }
    render(opts) {
        return this.nodes.reduce((code, n) => code + n.render(opts), "");
    }
    optimizeNodes() {
        const { nodes } = this;
        let i = nodes.length;
        while (i--) {
            const n = nodes[i].optimizeNodes();
            if (Array.isArray(n))
                nodes.splice(i, 1, ...n);
            else if (n)
                nodes[i] = n;
            else
                nodes.splice(i, 1);
        }
        return nodes.length > 0 ? this : undefined;
    }
    optimizeNames(names, constants) {
        const { nodes } = this;
        let i = nodes.length;
        while (i--) {
            // iterating backwards improves 1-pass optimization
            const n = nodes[i];
            if (n.optimizeNames(names, constants))
                continue;
            subtractNames(names, n.names);
            nodes.splice(i, 1);
        }
        return nodes.length > 0 ? this : undefined;
    }
    get names() {
        return this.nodes.reduce((names, n) => addNames(names, n.names), {});
    }
}
class BlockNode extends ParentNode {
    render(opts) {
        return "{" + opts._n + super.render(opts) + "}" + opts._n;
    }
}
class Root extends ParentNode {
}
class Else extends BlockNode {
}
Else.kind = "else";
class If extends BlockNode {
    constructor(condition, nodes) {
        super(nodes);
        this.condition = condition;
    }
    render(opts) {
        let code = `if(${this.condition})` + super.render(opts);
        if (this.else)
            code += "else " + this.else.render(opts);
        return code;
    }
    optimizeNodes() {
        super.optimizeNodes();
        const cond = this.condition;
        if (cond === true)
            return this.nodes; // else is ignored here
        let e = this.else;
        if (e) {
            const ns = e.optimizeNodes();
            e = this.else = Array.isArray(ns) ? new Else(ns) : ns;
        }
        if (e) {
            if (cond === false)
                return e instanceof If ? e : e.nodes;
            if (this.nodes.length)
                return this;
            return new If(not(cond), e instanceof If ? [e] : e.nodes);
        }
        if (cond === false || !this.nodes.length)
            return undefined;
        return this;
    }
    optimizeNames(names, constants) {
        var _a;
        this.else = (_a = this.else) === null || _a === void 0 ? void 0 : _a.optimizeNames(names, constants);
        if (!(super.optimizeNames(names, constants) || this.else))
            return;
        this.condition = optimizeExpr(this.condition, names, constants);
        return this;
    }
    get names() {
        const names = super.names;
        addExprNames(names, this.condition);
        if (this.else)
            addNames(names, this.else.names);
        return names;
    }
}
If.kind = "if";
class For extends BlockNode {
}
For.kind = "for";
class ForLoop extends For {
    constructor(iteration) {
        super();
        this.iteration = iteration;
    }
    render(opts) {
        return `for(${this.iteration})` + super.render(opts);
    }
    optimizeNames(names, constants) {
        if (!super.optimizeNames(names, constants))
            return;
        this.iteration = optimizeExpr(this.iteration, names, constants);
        return this;
    }
    get names() {
        return addNames(super.names, this.iteration.names);
    }
}
class ForRange extends For {
    constructor(varKind, name, from, to) {
        super();
        this.varKind = varKind;
        this.name = name;
        this.from = from;
        this.to = to;
    }
    render(opts) {
        const varKind = opts.es5 ? scope_1.varKinds.var : this.varKind;
        const { name, from, to } = this;
        return `for(${varKind} ${name}=${from}; ${name}<${to}; ${name}++)` + super.render(opts);
    }
    get names() {
        const names = addExprNames(super.names, this.from);
        return addExprNames(names, this.to);
    }
}
class ForIter extends For {
    constructor(loop, varKind, name, iterable) {
        super();
        this.loop = loop;
        this.varKind = varKind;
        this.name = name;
        this.iterable = iterable;
    }
    render(opts) {
        return `for(${this.varKind} ${this.name} ${this.loop} ${this.iterable})` + super.render(opts);
    }
    optimizeNames(names, constants) {
        if (!super.optimizeNames(names, constants))
            return;
        this.iterable = optimizeExpr(this.iterable, names, constants);
        return this;
    }
    get names() {
        return addNames(super.names, this.iterable.names);
    }
}
class Func extends BlockNode {
    constructor(name, args, async) {
        super();
        this.name = name;
        this.args = args;
        this.async = async;
    }
    render(opts) {
        const _async = this.async ? "async " : "";
        return `${_async}function ${this.name}(${this.args})` + super.render(opts);
    }
}
Func.kind = "func";
class Return extends ParentNode {
    render(opts) {
        return "return " + super.render(opts);
    }
}
Return.kind = "return";
class Try extends BlockNode {
    render(opts) {
        let code = "try" + super.render(opts);
        if (this.catch)
            code += this.catch.render(opts);
        if (this.finally)
            code += this.finally.render(opts);
        return code;
    }
    optimizeNodes() {
        var _a, _b;
        super.optimizeNodes();
        (_a = this.catch) === null || _a === void 0 ? void 0 : _a.optimizeNodes();
        (_b = this.finally) === null || _b === void 0 ? void 0 : _b.optimizeNodes();
        return this;
    }
    optimizeNames(names, constants) {
        var _a, _b;
        super.optimizeNames(names, constants);
        (_a = this.catch) === null || _a === void 0 ? void 0 : _a.optimizeNames(names, constants);
        (_b = this.finally) === null || _b === void 0 ? void 0 : _b.optimizeNames(names, constants);
        return this;
    }
    get names() {
        const names = super.names;
        if (this.catch)
            addNames(names, this.catch.names);
        if (this.finally)
            addNames(names, this.finally.names);
        return names;
    }
}
class Catch extends BlockNode {
    constructor(error) {
        super();
        this.error = error;
    }
    render(opts) {
        return `catch(${this.error})` + super.render(opts);
    }
}
Catch.kind = "catch";
class Finally extends BlockNode {
    render(opts) {
        return "finally" + super.render(opts);
    }
}
Finally.kind = "finally";
class CodeGen {
    constructor(extScope, opts = {}) {
        this._values = {};
        this._blockStarts = [];
        this._constants = {};
        this.opts = { ...opts, _n: opts.lines ? "\n" : "" };
        this._extScope = extScope;
        this._scope = new scope_1.Scope({ parent: extScope });
        this._nodes = [new Root()];
    }
    toString() {
        return this._root.render(this.opts);
    }
    // returns unique name in the internal scope
    name(prefix) {
        return this._scope.name(prefix);
    }
    // reserves unique name in the external scope
    scopeName(prefix) {
        return this._extScope.name(prefix);
    }
    // reserves unique name in the external scope and assigns value to it
    scopeValue(prefixOrName, value) {
        const name = this._extScope.value(prefixOrName, value);
        const vs = this._values[name.prefix] || (this._values[name.prefix] = new Set());
        vs.add(name);
        return name;
    }
    getScopeValue(prefix, keyOrRef) {
        return this._extScope.getValue(prefix, keyOrRef);
    }
    // return code that assigns values in the external scope to the names that are used internally
    // (same names that were returned by gen.scopeName or gen.scopeValue)
    scopeRefs(scopeName) {
        return this._extScope.scopeRefs(scopeName, this._values);
    }
    scopeCode() {
        return this._extScope.scopeCode(this._values);
    }
    _def(varKind, nameOrPrefix, rhs, constant) {
        const name = this._scope.toName(nameOrPrefix);
        if (rhs !== undefined && constant)
            this._constants[name.str] = rhs;
        this._leafNode(new Def(varKind, name, rhs));
        return name;
    }
    // `const` declaration (`var` in es5 mode)
    const(nameOrPrefix, rhs, _constant) {
        return this._def(scope_1.varKinds.const, nameOrPrefix, rhs, _constant);
    }
    // `let` declaration with optional assignment (`var` in es5 mode)
    let(nameOrPrefix, rhs, _constant) {
        return this._def(scope_1.varKinds.let, nameOrPrefix, rhs, _constant);
    }
    // `var` declaration with optional assignment
    var(nameOrPrefix, rhs, _constant) {
        return this._def(scope_1.varKinds.var, nameOrPrefix, rhs, _constant);
    }
    // assignment code
    assign(lhs, rhs, sideEffects) {
        return this._leafNode(new Assign(lhs, rhs, sideEffects));
    }
    // `+=` code
    add(lhs, rhs) {
        return this._leafNode(new AssignOp(lhs, exports.operators.ADD, rhs));
    }
    // appends passed SafeExpr to code or executes Block
    code(c) {
        if (typeof c == "function")
            c();
        else if (c !== code_1.nil)
            this._leafNode(new AnyCode(c));
        return this;
    }
    // returns code for object literal for the passed argument list of key-value pairs
    object(...keyValues) {
        const code = ["{"];
        for (const [key, value] of keyValues) {
            if (code.length > 1)
                code.push(",");
            code.push(key);
            if (key !== value || this.opts.es5) {
                code.push(":");
                (0, code_1.addCodeArg)(code, value);
            }
        }
        code.push("}");
        return new code_1._Code(code);
    }
    // `if` clause (or statement if `thenBody` and, optionally, `elseBody` are passed)
    if(condition, thenBody, elseBody) {
        this._blockNode(new If(condition));
        if (thenBody && elseBody) {
            this.code(thenBody).else().code(elseBody).endIf();
        }
        else if (thenBody) {
            this.code(thenBody).endIf();
        }
        else if (elseBody) {
            throw new Error('CodeGen: "else" body without "then" body');
        }
        return this;
    }
    // `else if` clause - invalid without `if` or after `else` clauses
    elseIf(condition) {
        return this._elseNode(new If(condition));
    }
    // `else` clause - only valid after `if` or `else if` clauses
    else() {
        return this._elseNode(new Else());
    }
    // end `if` statement (needed if gen.if was used only with condition)
    endIf() {
        return this._endBlockNode(If, Else);
    }
    _for(node, forBody) {
        this._blockNode(node);
        if (forBody)
            this.code(forBody).endFor();
        return this;
    }
    // a generic `for` clause (or statement if `forBody` is passed)
    for(iteration, forBody) {
        return this._for(new ForLoop(iteration), forBody);
    }
    // `for` statement for a range of values
    forRange(nameOrPrefix, from, to, forBody, varKind = this.opts.es5 ? scope_1.varKinds.var : scope_1.varKinds.let) {
        const name = this._scope.toName(nameOrPrefix);
        return this._for(new ForRange(varKind, name, from, to), () => forBody(name));
    }
    // `for-of` statement (in es5 mode replace with a normal for loop)
    forOf(nameOrPrefix, iterable, forBody, varKind = scope_1.varKinds.const) {
        const name = this._scope.toName(nameOrPrefix);
        if (this.opts.es5) {
            const arr = iterable instanceof code_1.Name ? iterable : this.var("_arr", iterable);
            return this.forRange("_i", 0, (0, code_1._) `${arr}.length`, (i) => {
                this.var(name, (0, code_1._) `${arr}[${i}]`);
                forBody(name);
            });
        }
        return this._for(new ForIter("of", varKind, name, iterable), () => forBody(name));
    }
    // `for-in` statement.
    // With option `ownProperties` replaced with a `for-of` loop for object keys
    forIn(nameOrPrefix, obj, forBody, varKind = this.opts.es5 ? scope_1.varKinds.var : scope_1.varKinds.const) {
        if (this.opts.ownProperties) {
            return this.forOf(nameOrPrefix, (0, code_1._) `Object.keys(${obj})`, forBody);
        }
        const name = this._scope.toName(nameOrPrefix);
        return this._for(new ForIter("in", varKind, name, obj), () => forBody(name));
    }
    // end `for` loop
    endFor() {
        return this._endBlockNode(For);
    }
    // `label` statement
    label(label) {
        return this._leafNode(new Label(label));
    }
    // `break` statement
    break(label) {
        return this._leafNode(new Break(label));
    }
    // `return` statement
    return(value) {
        const node = new Return();
        this._blockNode(node);
        this.code(value);
        if (node.nodes.length !== 1)
            throw new Error('CodeGen: "return" should have one node');
        return this._endBlockNode(Return);
    }
    // `try` statement
    try(tryBody, catchCode, finallyCode) {
        if (!catchCode && !finallyCode)
            throw new Error('CodeGen: "try" without "catch" and "finally"');
        const node = new Try();
        this._blockNode(node);
        this.code(tryBody);
        if (catchCode) {
            const error = this.name("e");
            this._currNode = node.catch = new Catch(error);
            catchCode(error);
        }
        if (finallyCode) {
            this._currNode = node.finally = new Finally();
            this.code(finallyCode);
        }
        return this._endBlockNode(Catch, Finally);
    }
    // `throw` statement
    throw(error) {
        return this._leafNode(new Throw(error));
    }
    // start self-balancing block
    block(body, nodeCount) {
        this._blockStarts.push(this._nodes.length);
        if (body)
            this.code(body).endBlock(nodeCount);
        return this;
    }
    // end the current self-balancing block
    endBlock(nodeCount) {
        const len = this._blockStarts.pop();
        if (len === undefined)
            throw new Error("CodeGen: not in self-balancing block");
        const toClose = this._nodes.length - len;
        if (toClose < 0 || (nodeCount !== undefined && toClose !== nodeCount)) {
            throw new Error(`CodeGen: wrong number of nodes: ${toClose} vs ${nodeCount} expected`);
        }
        this._nodes.length = len;
        return this;
    }
    // `function` heading (or definition if funcBody is passed)
    func(name, args = code_1.nil, async, funcBody) {
        this._blockNode(new Func(name, args, async));
        if (funcBody)
            this.code(funcBody).endFunc();
        return this;
    }
    // end function definition
    endFunc() {
        return this._endBlockNode(Func);
    }
    optimize(n = 1) {
        while (n-- > 0) {
            this._root.optimizeNodes();
            this._root.optimizeNames(this._root.names, this._constants);
        }
    }
    _leafNode(node) {
        this._currNode.nodes.push(node);
        return this;
    }
    _blockNode(node) {
        this._currNode.nodes.push(node);
        this._nodes.push(node);
    }
    _endBlockNode(N1, N2) {
        const n = this._currNode;
        if (n instanceof N1 || (N2 && n instanceof N2)) {
            this._nodes.pop();
            return this;
        }
        throw new Error(`CodeGen: not in block "${N2 ? `${N1.kind}/${N2.kind}` : N1.kind}"`);
    }
    _elseNode(node) {
        const n = this._currNode;
        if (!(n instanceof If)) {
            throw new Error('CodeGen: "else" without "if"');
        }
        this._currNode = n.else = node;
        return this;
    }
    get _root() {
        return this._nodes[0];
    }
    get _currNode() {
        const ns = this._nodes;
        return ns[ns.length - 1];
    }
    set _currNode(node) {
        const ns = this._nodes;
        ns[ns.length - 1] = node;
    }
}
exports.CodeGen = CodeGen;
function addNames(names, from) {
    for (const n in from)
        names[n] = (names[n] || 0) + (from[n] || 0);
    return names;
}
function addExprNames(names, from) {
    return from instanceof code_1._CodeOrName ? addNames(names, from.names) : names;
}
function optimizeExpr(expr, names, constants) {
    if (expr instanceof code_1.Name)
        return replaceName(expr);
    if (!canOptimize(expr))
        return expr;
    return new code_1._Code(expr._items.reduce((items, c) => {
        if (c instanceof code_1.Name)
            c = replaceName(c);
        if (c instanceof code_1._Code)
            items.push(...c._items);
        else
            items.push(c);
        return items;
    }, []));
    function replaceName(n) {
        const c = constants[n.str];
        if (c === undefined || names[n.str] !== 1)
            return n;
        delete names[n.str];
        return c;
    }
    function canOptimize(e) {
        return (e instanceof code_1._Code &&
            e._items.some((c) => c instanceof code_1.Name && names[c.str] === 1 && constants[c.str] !== undefined));
    }
}
function subtractNames(names, from) {
    for (const n in from)
        names[n] = (names[n] || 0) - (from[n] || 0);
}
function not(x) {
    return typeof x == "boolean" || typeof x == "number" || x === null ? !x : (0, code_1._) `!${par(x)}`;
}
exports.not = not;
const andCode = mappend(exports.operators.AND);
// boolean AND (&&) expression with the passed arguments
function and(...args) {
    return args.reduce(andCode);
}
exports.and = and;
const orCode = mappend(exports.operators.OR);
// boolean OR (||) expression with the passed arguments
function or(...args) {
    return args.reduce(orCode);
}
exports.or = or;
function mappend(op) {
    return (x, y) => (x === code_1.nil ? y : y === code_1.nil ? x : (0, code_1._) `${par(x)} ${op} ${par(y)}`);
}
function par(x) {
    return x instanceof code_1.Name ? x : (0, code_1._) `(${x})`;
}
//# sourceMappingURL=index.js.map

},
37413(__unused_rspack_module, exports, __webpack_require__) {

Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.ValueScope = exports.ValueScopeName = exports.Scope = exports.varKinds = exports.UsedValueState = void 0;
const code_1 = __webpack_require__(57568);
class ValueError extends Error {
    constructor(name) {
        super(`CodeGen: "code" for ${name} not defined`);
        this.value = name.value;
    }
}
var UsedValueState;
(function (UsedValueState) {
    UsedValueState[UsedValueState["Started"] = 0] = "Started";
    UsedValueState[UsedValueState["Completed"] = 1] = "Completed";
})(UsedValueState || (exports.UsedValueState = UsedValueState = {}));
exports.varKinds = {
    const: new code_1.Name("const"),
    let: new code_1.Name("let"),
    var: new code_1.Name("var"),
};
class Scope {
    constructor({ prefixes, parent } = {}) {
        this._names = {};
        this._prefixes = prefixes;
        this._parent = parent;
    }
    toName(nameOrPrefix) {
        return nameOrPrefix instanceof code_1.Name ? nameOrPrefix : this.name(nameOrPrefix);
    }
    name(prefix) {
        return new code_1.Name(this._newName(prefix));
    }
    _newName(prefix) {
        const ng = this._names[prefix] || this._nameGroup(prefix);
        return `${prefix}${ng.index++}`;
    }
    _nameGroup(prefix) {
        var _a, _b;
        if (((_b = (_a = this._parent) === null || _a === void 0 ? void 0 : _a._prefixes) === null || _b === void 0 ? void 0 : _b.has(prefix)) || (this._prefixes && !this._prefixes.has(prefix))) {
            throw new Error(`CodeGen: prefix "${prefix}" is not allowed in this scope`);
        }
        return (this._names[prefix] = { prefix, index: 0 });
    }
}
exports.Scope = Scope;
class ValueScopeName extends code_1.Name {
    constructor(prefix, nameStr) {
        super(nameStr);
        this.prefix = prefix;
    }
    setValue(value, { property, itemIndex }) {
        this.value = value;
        this.scopePath = (0, code_1._) `.${new code_1.Name(property)}[${itemIndex}]`;
    }
}
exports.ValueScopeName = ValueScopeName;
const line = (0, code_1._) `\n`;
class ValueScope extends Scope {
    constructor(opts) {
        super(opts);
        this._values = {};
        this._scope = opts.scope;
        this.opts = { ...opts, _n: opts.lines ? line : code_1.nil };
    }
    get() {
        return this._scope;
    }
    name(prefix) {
        return new ValueScopeName(prefix, this._newName(prefix));
    }
    value(nameOrPrefix, value) {
        var _a;
        if (value.ref === undefined)
            throw new Error("CodeGen: ref must be passed in value");
        const name = this.toName(nameOrPrefix);
        const { prefix } = name;
        const valueKey = (_a = value.key) !== null && _a !== void 0 ? _a : value.ref;
        let vs = this._values[prefix];
        if (vs) {
            const _name = vs.get(valueKey);
            if (_name)
                return _name;
        }
        else {
            vs = this._values[prefix] = new Map();
        }
        vs.set(valueKey, name);
        const s = this._scope[prefix] || (this._scope[prefix] = []);
        const itemIndex = s.length;
        s[itemIndex] = value.ref;
        name.setValue(value, { property: prefix, itemIndex });
        return name;
    }
    getValue(prefix, keyOrRef) {
        const vs = this._values[prefix];
        if (!vs)
            return;
        return vs.get(keyOrRef);
    }
    scopeRefs(scopeName, values = this._values) {
        return this._reduceValues(values, (name) => {
            if (name.scopePath === undefined)
                throw new Error(`CodeGen: name "${name}" has no value`);
            return (0, code_1._) `${scopeName}${name.scopePath}`;
        });
    }
    scopeCode(values = this._values, usedValues, getCode) {
        return this._reduceValues(values, (name) => {
            if (name.value === undefined)
                throw new Error(`CodeGen: name "${name}" has no value`);
            return name.value.code;
        }, usedValues, getCode);
    }
    _reduceValues(values, valueCode, usedValues = {}, getCode) {
        let code = code_1.nil;
        for (const prefix in values) {
            const vs = values[prefix];
            if (!vs)
                continue;
            const nameSet = (usedValues[prefix] = usedValues[prefix] || new Map());
            vs.forEach((name) => {
                if (nameSet.has(name))
                    return;
                nameSet.set(name, UsedValueState.Started);
                let c = valueCode(name);
                if (c) {
                    const def = this.opts.es5 ? exports.varKinds["var"] : exports.varKinds["const"];
                    code = (0, code_1._) `${code}${def} ${name} = ${c};${this.opts._n}`;
                }
                else if ((c = getCode === null || getCode === void 0 ? void 0 : getCode(name))) {
                    code = (0, code_1._) `${code}${c}${this.opts._n}`;
                }
                else {
                    throw new ValueError(name);
                }
                nameSet.set(name, UsedValueState.Completed);
            });
        }
        return code;
    }
}
exports.ValueScope = ValueScope;
//# sourceMappingURL=scope.js.map

},
16660(__unused_rspack_module, exports, __webpack_require__) {
var __webpack_unused_export__;

__webpack_unused_export__ = ({ value: true });
exports.extendErrors = exports.resetErrorsCount = exports.reportExtraError = exports.reportError = exports.keyword$DataError = exports.y = void 0;
const codegen_1 = __webpack_require__(48325);
const util_1 = __webpack_require__(53571);
const names_1 = __webpack_require__(28727);
exports.y = {
    message: ({ keyword }) => (0, codegen_1.str) `must pass "${keyword}" keyword validation`,
};
exports.keyword$DataError = {
    message: ({ keyword, schemaType }) => schemaType
        ? (0, codegen_1.str) `"${keyword}" keyword must be ${schemaType} ($data)`
        : (0, codegen_1.str) `"${keyword}" keyword is invalid ($data)`,
};
function reportError(cxt, error = exports.y, errorPaths, overrideAllErrors) {
    const { it } = cxt;
    const { gen, compositeRule, allErrors } = it;
    const errObj = errorObjectCode(cxt, error, errorPaths);
    if (overrideAllErrors !== null && overrideAllErrors !== void 0 ? overrideAllErrors : (compositeRule || allErrors)) {
        addError(gen, errObj);
    }
    else {
        returnErrors(it, (0, codegen_1._) `[${errObj}]`);
    }
}
exports.reportError = reportError;
function reportExtraError(cxt, error = exports.y, errorPaths) {
    const { it } = cxt;
    const { gen, compositeRule, allErrors } = it;
    const errObj = errorObjectCode(cxt, error, errorPaths);
    addError(gen, errObj);
    if (!(compositeRule || allErrors)) {
        returnErrors(it, names_1.default.vErrors);
    }
}
exports.reportExtraError = reportExtraError;
function resetErrorsCount(gen, errsCount) {
    gen.assign(names_1.default.errors, errsCount);
    gen.if((0, codegen_1._) `${names_1.default.vErrors} !== null`, () => gen.if(errsCount, () => gen.assign((0, codegen_1._) `${names_1.default.vErrors}.length`, errsCount), () => gen.assign(names_1.default.vErrors, null)));
}
exports.resetErrorsCount = resetErrorsCount;
function extendErrors({ gen, keyword, schemaValue, data, errsCount, it, }) {
    /* istanbul ignore if */
    if (errsCount === undefined)
        throw new Error("ajv implementation error");
    const err = gen.name("err");
    gen.forRange("i", errsCount, names_1.default.errors, (i) => {
        gen.const(err, (0, codegen_1._) `${names_1.default.vErrors}[${i}]`);
        gen.if((0, codegen_1._) `${err}.instancePath === undefined`, () => gen.assign((0, codegen_1._) `${err}.instancePath`, (0, codegen_1.strConcat)(names_1.default.instancePath, it.errorPath)));
        gen.assign((0, codegen_1._) `${err}.schemaPath`, (0, codegen_1.str) `${it.errSchemaPath}/${keyword}`);
        if (it.opts.verbose) {
            gen.assign((0, codegen_1._) `${err}.schema`, schemaValue);
            gen.assign((0, codegen_1._) `${err}.data`, data);
        }
    });
}
exports.extendErrors = extendErrors;
function addError(gen, errObj) {
    const err = gen.const("err", errObj);
    gen.if((0, codegen_1._) `${names_1.default.vErrors} === null`, () => gen.assign(names_1.default.vErrors, (0, codegen_1._) `[${err}]`), (0, codegen_1._) `${names_1.default.vErrors}.push(${err})`);
    gen.code((0, codegen_1._) `${names_1.default.errors}++`);
}
function returnErrors(it, errs) {
    const { gen, validateName, schemaEnv } = it;
    if (schemaEnv.$async) {
        gen.throw((0, codegen_1._) `new ${it.ValidationError}(${errs})`);
    }
    else {
        gen.assign((0, codegen_1._) `${validateName}.errors`, errs);
        gen.return(false);
    }
}
const E = {
    keyword: new codegen_1.Name("keyword"),
    schemaPath: new codegen_1.Name("schemaPath"), // also used in JTD errors
    params: new codegen_1.Name("params"),
    propertyName: new codegen_1.Name("propertyName"),
    message: new codegen_1.Name("message"),
    schema: new codegen_1.Name("schema"),
    parentSchema: new codegen_1.Name("parentSchema"),
};
function errorObjectCode(cxt, error, errorPaths) {
    const { createErrors } = cxt.it;
    if (createErrors === false)
        return (0, codegen_1._) `{}`;
    return errorObject(cxt, error, errorPaths);
}
function errorObject(cxt, error, errorPaths = {}) {
    const { gen, it } = cxt;
    const keyValues = [
        errorInstancePath(it, errorPaths),
        errorSchemaPath(cxt, errorPaths),
    ];
    extraErrorProps(cxt, error, keyValues);
    return gen.object(...keyValues);
}
function errorInstancePath({ errorPath }, { instancePath }) {
    const instPath = instancePath
        ? (0, codegen_1.str) `${errorPath}${(0, util_1.getErrorPath)(instancePath, util_1.Type.Str)}`
        : errorPath;
    return [names_1.default.instancePath, (0, codegen_1.strConcat)(names_1.default.instancePath, instPath)];
}
function errorSchemaPath({ keyword, it: { errSchemaPath } }, { schemaPath, parentSchema }) {
    let schPath = parentSchema ? errSchemaPath : (0, codegen_1.str) `${errSchemaPath}/${keyword}`;
    if (schemaPath) {
        schPath = (0, codegen_1.str) `${schPath}${(0, util_1.getErrorPath)(schemaPath, util_1.Type.Str)}`;
    }
    return [E.schemaPath, schPath];
}
function extraErrorProps(cxt, { params, message }, keyValues) {
    const { keyword, data, schemaValue, it } = cxt;
    const { opts, propertyName, topSchemaRef, schemaPath } = it;
    keyValues.push([E.keyword, keyword], [E.params, typeof params == "function" ? params(cxt) : params || (0, codegen_1._) `{}`]);
    if (opts.messages) {
        keyValues.push([E.message, typeof message == "function" ? message(cxt) : message]);
    }
    if (opts.verbose) {
        keyValues.push([E.schema, schemaValue], [E.parentSchema, (0, codegen_1._) `${topSchemaRef}${schemaPath}`], [names_1.default.data, data]);
    }
    if (propertyName)
        keyValues.push([E.propertyName, propertyName]);
}
//# sourceMappingURL=errors.js.map

},
53403(__unused_rspack_module, exports, __webpack_require__) {
var __webpack_unused_export__;

__webpack_unused_export__ = ({ value: true });
exports.resolveSchema = __webpack_unused_export__ = exports.resolveRef = exports.compileSchema = exports.SchemaEnv = void 0;
const codegen_1 = __webpack_require__(48325);
const validation_error_1 = __webpack_require__(9894);
const names_1 = __webpack_require__(28727);
const resolve_1 = __webpack_require__(87307);
const util_1 = __webpack_require__(53571);
const validate_1 = __webpack_require__(42890);
class SchemaEnv {
    constructor(env) {
        var _a;
        this.refs = {};
        this.dynamicAnchors = {};
        let schema;
        if (typeof env.schema == "object")
            schema = env.schema;
        this.schema = env.schema;
        this.schemaId = env.schemaId;
        this.root = env.root || this;
        this.baseId = (_a = env.baseId) !== null && _a !== void 0 ? _a : (0, resolve_1.normalizeId)(schema === null || schema === void 0 ? void 0 : schema[env.schemaId || "$id"]);
        this.schemaPath = env.schemaPath;
        this.localRefs = env.localRefs;
        this.meta = env.meta;
        this.$async = schema === null || schema === void 0 ? void 0 : schema.$async;
        this.refs = {};
    }
}
exports.SchemaEnv = SchemaEnv;
// let codeSize = 0
// let nodeCount = 0
// Compiles schema in SchemaEnv
function compileSchema(sch) {
    // TODO refactor - remove compilations
    const _sch = getCompilingSchema.call(this, sch);
    if (_sch)
        return _sch;
    const rootId = (0, resolve_1.getFullPath)(this.opts.uriResolver, sch.root.baseId); // TODO if getFullPath removed 1 tests fails
    const { es5, lines } = this.opts.code;
    const { ownProperties } = this.opts;
    const gen = new codegen_1.CodeGen(this.scope, { es5, lines, ownProperties });
    let _ValidationError;
    if (sch.$async) {
        _ValidationError = gen.scopeValue("Error", {
            ref: validation_error_1.default,
            code: (0, codegen_1._) `require("ajv/dist/runtime/validation_error").default`,
        });
    }
    const validateName = gen.scopeName("validate");
    sch.validateName = validateName;
    const schemaCxt = {
        gen,
        allErrors: this.opts.allErrors,
        data: names_1.default.data,
        parentData: names_1.default.parentData,
        parentDataProperty: names_1.default.parentDataProperty,
        dataNames: [names_1.default.data],
        dataPathArr: [codegen_1.nil], // TODO can its length be used as dataLevel if nil is removed?
        dataLevel: 0,
        dataTypes: [],
        definedProperties: new Set(),
        topSchemaRef: gen.scopeValue("schema", this.opts.code.source === true
            ? { ref: sch.schema, code: (0, codegen_1.stringify)(sch.schema) }
            : { ref: sch.schema }),
        validateName,
        ValidationError: _ValidationError,
        schema: sch.schema,
        schemaEnv: sch,
        rootId,
        baseId: sch.baseId || rootId,
        schemaPath: codegen_1.nil,
        errSchemaPath: sch.schemaPath || (this.opts.jtd ? "" : "#"),
        errorPath: (0, codegen_1._) `""`,
        opts: this.opts,
        self: this,
    };
    let sourceCode;
    try {
        this._compilations.add(sch);
        (0, validate_1.validateFunctionCode)(schemaCxt);
        gen.optimize(this.opts.code.optimize);
        // gen.optimize(1)
        const validateCode = gen.toString();
        sourceCode = `${gen.scopeRefs(names_1.default.scope)}return ${validateCode}`;
        // console.log((codeSize += sourceCode.length), (nodeCount += gen.nodeCount))
        if (this.opts.code.process)
            sourceCode = this.opts.code.process(sourceCode, sch);
        // console.log("\n\n\n *** \n", sourceCode)
        const makeValidate = new Function(`${names_1.default.self}`, `${names_1.default.scope}`, sourceCode);
        const validate = makeValidate(this, this.scope.get());
        this.scope.value(validateName, { ref: validate });
        validate.errors = null;
        validate.schema = sch.schema;
        validate.schemaEnv = sch;
        if (sch.$async)
            validate.$async = true;
        if (this.opts.code.source === true) {
            validate.source = { validateName, validateCode, scopeValues: gen._values };
        }
        if (this.opts.unevaluated) {
            const { props, items } = schemaCxt;
            validate.evaluated = {
                props: props instanceof codegen_1.Name ? undefined : props,
                items: items instanceof codegen_1.Name ? undefined : items,
                dynamicProps: props instanceof codegen_1.Name,
                dynamicItems: items instanceof codegen_1.Name,
            };
            if (validate.source)
                validate.source.evaluated = (0, codegen_1.stringify)(validate.evaluated);
        }
        sch.validate = validate;
        return sch;
    }
    catch (e) {
        delete sch.validate;
        delete sch.validateName;
        if (sourceCode)
            this.logger.error("Error compiling schema, function code:", sourceCode);
        // console.log("\n\n\n *** \n", sourceCode, this.opts)
        throw e;
    }
    finally {
        this._compilations.delete(sch);
    }
}
exports.compileSchema = compileSchema;
function resolveRef(root, baseId, ref) {
    var _a;
    ref = (0, resolve_1.resolveUrl)(this.opts.uriResolver, baseId, ref);
    const schOrFunc = root.refs[ref];
    if (schOrFunc)
        return schOrFunc;
    let _sch = resolve.call(this, root, ref);
    if (_sch === undefined) {
        const schema = (_a = root.localRefs) === null || _a === void 0 ? void 0 : _a[ref]; // TODO maybe localRefs should hold SchemaEnv
        const { schemaId } = this.opts;
        if (schema)
            _sch = new SchemaEnv({ schema, schemaId, root, baseId });
    }
    if (_sch === undefined)
        return;
    return (root.refs[ref] = inlineOrCompile.call(this, _sch));
}
exports.resolveRef = resolveRef;
function inlineOrCompile(sch) {
    if ((0, resolve_1.inlineRef)(sch.schema, this.opts.inlineRefs))
        return sch.schema;
    return sch.validate ? sch : compileSchema.call(this, sch);
}
// Index of schema compilation in the currently compiled list
function getCompilingSchema(schEnv) {
    for (const sch of this._compilations) {
        if (sameSchemaEnv(sch, schEnv))
            return sch;
    }
}
__webpack_unused_export__ = getCompilingSchema;
function sameSchemaEnv(s1, s2) {
    return s1.schema === s2.schema && s1.root === s2.root && s1.baseId === s2.baseId;
}
// resolve and compile the references ($ref)
// TODO returns AnySchemaObject (if the schema can be inlined) or validation function
function resolve(root, // information about the root schema for the current schema
ref // reference to resolve
) {
    let sch;
    while (typeof (sch = this.refs[ref]) == "string")
        ref = sch;
    return sch || this.schemas[ref] || resolveSchema.call(this, root, ref);
}
// Resolve schema, its root and baseId
function resolveSchema(root, // root object with properties schema, refs TODO below SchemaEnv is assigned to it
ref // reference to resolve
) {
    const p = this.opts.uriResolver.parse(ref);
    const refPath = (0, resolve_1._getFullPath)(this.opts.uriResolver, p);
    let baseId = (0, resolve_1.getFullPath)(this.opts.uriResolver, root.baseId, undefined);
    // TODO `Object.keys(root.schema).length > 0` should not be needed - but removing breaks 2 tests
    if (Object.keys(root.schema).length > 0 && refPath === baseId) {
        return getJsonPointer.call(this, p, root);
    }
    const id = (0, resolve_1.normalizeId)(refPath);
    const schOrRef = this.refs[id] || this.schemas[id];
    if (typeof schOrRef == "string") {
        const sch = resolveSchema.call(this, root, schOrRef);
        if (typeof (sch === null || sch === void 0 ? void 0 : sch.schema) !== "object")
            return;
        return getJsonPointer.call(this, p, sch);
    }
    if (typeof (schOrRef === null || schOrRef === void 0 ? void 0 : schOrRef.schema) !== "object")
        return;
    if (!schOrRef.validate)
        compileSchema.call(this, schOrRef);
    if (id === (0, resolve_1.normalizeId)(ref)) {
        const { schema } = schOrRef;
        const { schemaId } = this.opts;
        const schId = schema[schemaId];
        if (schId)
            baseId = (0, resolve_1.resolveUrl)(this.opts.uriResolver, baseId, schId);
        return new SchemaEnv({ schema, schemaId, root, baseId });
    }
    return getJsonPointer.call(this, p, schOrRef);
}
exports.resolveSchema = resolveSchema;
const PREVENT_SCOPE_CHANGE = new Set([
    "properties",
    "patternProperties",
    "enum",
    "dependencies",
    "definitions",
]);
function getJsonPointer(parsedRef, { baseId, schema, root }) {
    var _a;
    if (((_a = parsedRef.fragment) === null || _a === void 0 ? void 0 : _a[0]) !== "/")
        return;
    for (const part of parsedRef.fragment.slice(1).split("/")) {
        if (typeof schema === "boolean")
            return;
        const partSchema = schema[(0, util_1.unescapeFragment)(part)];
        if (partSchema === undefined)
            return;
        schema = partSchema;
        // TODO PREVENT_SCOPE_CHANGE could be defined in keyword def?
        const schId = typeof schema === "object" && schema[this.opts.schemaId];
        if (!PREVENT_SCOPE_CHANGE.has(part) && schId) {
            baseId = (0, resolve_1.resolveUrl)(this.opts.uriResolver, baseId, schId);
        }
    }
    let env;
    if (typeof schema != "boolean" && schema.$ref && !(0, util_1.schemaHasRulesButRef)(schema, this.RULES)) {
        const $ref = (0, resolve_1.resolveUrl)(this.opts.uriResolver, baseId, schema.$ref);
        env = resolveSchema.call(this, root, $ref);
    }
    // even though resolution failed we need to return SchemaEnv to throw exception
    // so that compileAsync loads missing schema.
    const { schemaId } = this.opts;
    env = env || new SchemaEnv({ schema, schemaId, root, baseId });
    if (env.schema !== env.root.schema)
        return env;
    return undefined;
}
//# sourceMappingURL=index.js.map

},
28727(__unused_rspack_module, exports, __webpack_require__) {
var __webpack_unused_export__;

__webpack_unused_export__ = ({ value: true });
const codegen_1 = __webpack_require__(48325);
const names = {
    // validation function arguments
    data: new codegen_1.Name("data"), // data passed to validation function
    // args passed from referencing schema
    valCxt: new codegen_1.Name("valCxt"), // validation/data context - should not be used directly, it is destructured to the names below
    instancePath: new codegen_1.Name("instancePath"),
    parentData: new codegen_1.Name("parentData"),
    parentDataProperty: new codegen_1.Name("parentDataProperty"),
    rootData: new codegen_1.Name("rootData"), // root data - same as the data passed to the first/top validation function
    dynamicAnchors: new codegen_1.Name("dynamicAnchors"), // used to support recursiveRef and dynamicRef
    // function scoped variables
    vErrors: new codegen_1.Name("vErrors"), // null or array of validation errors
    errors: new codegen_1.Name("errors"), // counter of validation errors
    this: new codegen_1.Name("this"),
    // "globals"
    self: new codegen_1.Name("self"),
    scope: new codegen_1.Name("scope"),
    // JTD serialize/parse name for JSON string and position
    json: new codegen_1.Name("json"),
    jsonPos: new codegen_1.Name("jsonPos"),
    jsonLen: new codegen_1.Name("jsonLen"),
    jsonPart: new codegen_1.Name("jsonPart"),
};
exports["default"] = names;
//# sourceMappingURL=names.js.map

},
29319(__unused_rspack_module, exports, __webpack_require__) {

Object.defineProperty(exports, "__esModule", ({ value: true }));
const resolve_1 = __webpack_require__(87307);
class MissingRefError extends Error {
    constructor(resolver, baseId, ref, msg) {
        super(msg || `can't resolve reference ${ref} from id ${baseId}`);
        this.missingRef = (0, resolve_1.resolveUrl)(resolver, baseId, ref);
        this.missingSchema = (0, resolve_1.normalizeId)((0, resolve_1.getFullPath)(resolver, this.missingRef));
    }
}
exports["default"] = MissingRefError;
//# sourceMappingURL=ref_error.js.map

},
87307(__unused_rspack_module, exports, __webpack_require__) {
var __webpack_unused_export__;

__webpack_unused_export__ = ({ value: true });
exports.getSchemaRefs = exports.resolveUrl = exports.normalizeId = exports._getFullPath = exports.getFullPath = exports.inlineRef = void 0;
const util_1 = __webpack_require__(53571);
const equal = __webpack_require__(88992);
const traverse = __webpack_require__(26770);
// TODO refactor to use keyword definitions
const SIMPLE_INLINED = new Set([
    "type",
    "format",
    "pattern",
    "maxLength",
    "minLength",
    "maxProperties",
    "minProperties",
    "maxItems",
    "minItems",
    "maximum",
    "minimum",
    "uniqueItems",
    "multipleOf",
    "required",
    "enum",
    "const",
]);
function inlineRef(schema, limit = true) {
    if (typeof schema == "boolean")
        return true;
    if (limit === true)
        return !hasRef(schema);
    if (!limit)
        return false;
    return countKeys(schema) <= limit;
}
exports.inlineRef = inlineRef;
const REF_KEYWORDS = new Set([
    "$ref",
    "$recursiveRef",
    "$recursiveAnchor",
    "$dynamicRef",
    "$dynamicAnchor",
]);
function hasRef(schema) {
    for (const key in schema) {
        if (REF_KEYWORDS.has(key))
            return true;
        const sch = schema[key];
        if (Array.isArray(sch) && sch.some(hasRef))
            return true;
        if (typeof sch == "object" && hasRef(sch))
            return true;
    }
    return false;
}
function countKeys(schema) {
    let count = 0;
    for (const key in schema) {
        if (key === "$ref")
            return Infinity;
        count++;
        if (SIMPLE_INLINED.has(key))
            continue;
        if (typeof schema[key] == "object") {
            (0, util_1.eachItem)(schema[key], (sch) => (count += countKeys(sch)));
        }
        if (count === Infinity)
            return Infinity;
    }
    return count;
}
function getFullPath(resolver, id = "", normalize) {
    if (normalize !== false)
        id = normalizeId(id);
    const p = resolver.parse(id);
    return _getFullPath(resolver, p);
}
exports.getFullPath = getFullPath;
function _getFullPath(resolver, p) {
    const serialized = resolver.serialize(p);
    return serialized.split("#")[0] + "#";
}
exports._getFullPath = _getFullPath;
const TRAILING_SLASH_HASH = /#\/?$/;
function normalizeId(id) {
    return id ? id.replace(TRAILING_SLASH_HASH, "") : "";
}
exports.normalizeId = normalizeId;
function resolveUrl(resolver, baseId, id) {
    id = normalizeId(id);
    return resolver.resolve(baseId, id);
}
exports.resolveUrl = resolveUrl;
const ANCHOR = /^[a-z_][-a-z0-9._]*$/i;
function getSchemaRefs(schema, baseId) {
    if (typeof schema == "boolean")
        return {};
    const { schemaId, uriResolver } = this.opts;
    const schId = normalizeId(schema[schemaId] || baseId);
    const baseIds = { "": schId };
    const pathPrefix = getFullPath(uriResolver, schId, false);
    const localRefs = {};
    const schemaRefs = new Set();
    traverse(schema, { allKeys: true }, (sch, jsonPtr, _, parentJsonPtr) => {
        if (parentJsonPtr === undefined)
            return;
        const fullPath = pathPrefix + jsonPtr;
        let innerBaseId = baseIds[parentJsonPtr];
        if (typeof sch[schemaId] == "string")
            innerBaseId = addRef.call(this, sch[schemaId]);
        addAnchor.call(this, sch.$anchor);
        addAnchor.call(this, sch.$dynamicAnchor);
        baseIds[jsonPtr] = innerBaseId;
        function addRef(ref) {
            // eslint-disable-next-line @typescript-eslint/unbound-method
            const _resolve = this.opts.uriResolver.resolve;
            ref = normalizeId(innerBaseId ? _resolve(innerBaseId, ref) : ref);
            if (schemaRefs.has(ref))
                throw ambiguos(ref);
            schemaRefs.add(ref);
            let schOrRef = this.refs[ref];
            if (typeof schOrRef == "string")
                schOrRef = this.refs[schOrRef];
            if (typeof schOrRef == "object") {
                checkAmbiguosRef(sch, schOrRef.schema, ref);
            }
            else if (ref !== normalizeId(fullPath)) {
                if (ref[0] === "#") {
                    checkAmbiguosRef(sch, localRefs[ref], ref);
                    localRefs[ref] = sch;
                }
                else {
                    this.refs[ref] = fullPath;
                }
            }
            return ref;
        }
        function addAnchor(anchor) {
            if (typeof anchor == "string") {
                if (!ANCHOR.test(anchor))
                    throw new Error(`invalid anchor "${anchor}"`);
                addRef.call(this, `#${anchor}`);
            }
        }
    });
    return localRefs;
    function checkAmbiguosRef(sch1, sch2, ref) {
        if (sch2 !== undefined && !equal(sch1, sch2))
            throw ambiguos(ref);
    }
    function ambiguos(ref) {
        return new Error(`reference "${ref}" resolves to more than one schema`);
    }
}
exports.getSchemaRefs = getSchemaRefs;
//# sourceMappingURL=resolve.js.map

},
21228(__unused_rspack_module, exports) {
var __webpack_unused_export__;

__webpack_unused_export__ = ({ value: true });
exports.getRules = exports.isJSONType = void 0;
const _jsonTypes = ["string", "number", "integer", "boolean", "null", "object", "array"];
const jsonTypes = new Set(_jsonTypes);
function isJSONType(x) {
    return typeof x == "string" && jsonTypes.has(x);
}
exports.isJSONType = isJSONType;
function getRules() {
    const groups = {
        number: { type: "number", rules: [] },
        string: { type: "string", rules: [] },
        array: { type: "array", rules: [] },
        object: { type: "object", rules: [] },
    };
    return {
        types: { ...groups, integer: true, boolean: true, null: true },
        rules: [{ rules: [] }, groups.number, groups.string, groups.array, groups.object],
        post: { rules: [] },
        all: {},
        keywords: {},
    };
}
exports.getRules = getRules;
//# sourceMappingURL=rules.js.map

},
53571(__unused_rspack_module, exports, __webpack_require__) {
var __webpack_unused_export__;

__webpack_unused_export__ = ({ value: true });
exports.checkStrictMode = exports.getErrorPath = exports.Type = exports.useFunc = __webpack_unused_export__ = exports.evaluatedPropsToName = exports.mergeEvaluated = exports.eachItem = exports.unescapeJsonPointer = __webpack_unused_export__ = exports.escapeFragment = exports.unescapeFragment = exports.schemaRefOrVal = exports.schemaHasRulesButRef = __webpack_unused_export__ = exports.checkUnknownRules = exports.alwaysValidSchema = exports.toHash = void 0;
const codegen_1 = __webpack_require__(48325);
const code_1 = __webpack_require__(57568);
// TODO refactor to use Set
function toHash(arr) {
    const hash = {};
    for (const item of arr)
        hash[item] = true;
    return hash;
}
exports.toHash = toHash;
function alwaysValidSchema(it, schema) {
    if (typeof schema == "boolean")
        return schema;
    if (Object.keys(schema).length === 0)
        return true;
    checkUnknownRules(it, schema);
    return !schemaHasRules(schema, it.self.RULES.all);
}
exports.alwaysValidSchema = alwaysValidSchema;
function checkUnknownRules(it, schema = it.schema) {
    const { opts, self } = it;
    if (!opts.strictSchema)
        return;
    if (typeof schema === "boolean")
        return;
    const rules = self.RULES.keywords;
    for (const key in schema) {
        if (!rules[key])
            checkStrictMode(it, `unknown keyword: "${key}"`);
    }
}
exports.checkUnknownRules = checkUnknownRules;
function schemaHasRules(schema, rules) {
    if (typeof schema == "boolean")
        return !schema;
    for (const key in schema)
        if (rules[key])
            return true;
    return false;
}
__webpack_unused_export__ = schemaHasRules;
function schemaHasRulesButRef(schema, RULES) {
    if (typeof schema == "boolean")
        return !schema;
    for (const key in schema)
        if (key !== "$ref" && RULES.all[key])
            return true;
    return false;
}
exports.schemaHasRulesButRef = schemaHasRulesButRef;
function schemaRefOrVal({ topSchemaRef, schemaPath }, schema, keyword, $data) {
    if (!$data) {
        if (typeof schema == "number" || typeof schema == "boolean")
            return schema;
        if (typeof schema == "string")
            return (0, codegen_1._) `${schema}`;
    }
    return (0, codegen_1._) `${topSchemaRef}${schemaPath}${(0, codegen_1.getProperty)(keyword)}`;
}
exports.schemaRefOrVal = schemaRefOrVal;
function unescapeFragment(str) {
    return unescapeJsonPointer(decodeURIComponent(str));
}
exports.unescapeFragment = unescapeFragment;
function escapeFragment(str) {
    return encodeURIComponent(escapeJsonPointer(str));
}
exports.escapeFragment = escapeFragment;
function escapeJsonPointer(str) {
    if (typeof str == "number")
        return `${str}`;
    return str.replace(/~/g, "~0").replace(/\//g, "~1");
}
__webpack_unused_export__ = escapeJsonPointer;
function unescapeJsonPointer(str) {
    return str.replace(/~1/g, "/").replace(/~0/g, "~");
}
exports.unescapeJsonPointer = unescapeJsonPointer;
function eachItem(xs, f) {
    if (Array.isArray(xs)) {
        for (const x of xs)
            f(x);
    }
    else {
        f(xs);
    }
}
exports.eachItem = eachItem;
function makeMergeEvaluated({ mergeNames, mergeToName, mergeValues, resultToName, }) {
    return (gen, from, to, toName) => {
        const res = to === undefined
            ? from
            : to instanceof codegen_1.Name
                ? (from instanceof codegen_1.Name ? mergeNames(gen, from, to) : mergeToName(gen, from, to), to)
                : from instanceof codegen_1.Name
                    ? (mergeToName(gen, to, from), from)
                    : mergeValues(from, to);
        return toName === codegen_1.Name && !(res instanceof codegen_1.Name) ? resultToName(gen, res) : res;
    };
}
exports.mergeEvaluated = {
    props: makeMergeEvaluated({
        mergeNames: (gen, from, to) => gen.if((0, codegen_1._) `${to} !== true && ${from} !== undefined`, () => {
            gen.if((0, codegen_1._) `${from} === true`, () => gen.assign(to, true), () => gen.assign(to, (0, codegen_1._) `${to} || {}`).code((0, codegen_1._) `Object.assign(${to}, ${from})`));
        }),
        mergeToName: (gen, from, to) => gen.if((0, codegen_1._) `${to} !== true`, () => {
            if (from === true) {
                gen.assign(to, true);
            }
            else {
                gen.assign(to, (0, codegen_1._) `${to} || {}`);
                setEvaluated(gen, to, from);
            }
        }),
        mergeValues: (from, to) => (from === true ? true : { ...from, ...to }),
        resultToName: evaluatedPropsToName,
    }),
    items: makeMergeEvaluated({
        mergeNames: (gen, from, to) => gen.if((0, codegen_1._) `${to} !== true && ${from} !== undefined`, () => gen.assign(to, (0, codegen_1._) `${from} === true ? true : ${to} > ${from} ? ${to} : ${from}`)),
        mergeToName: (gen, from, to) => gen.if((0, codegen_1._) `${to} !== true`, () => gen.assign(to, from === true ? true : (0, codegen_1._) `${to} > ${from} ? ${to} : ${from}`)),
        mergeValues: (from, to) => (from === true ? true : Math.max(from, to)),
        resultToName: (gen, items) => gen.var("items", items),
    }),
};
function evaluatedPropsToName(gen, ps) {
    if (ps === true)
        return gen.var("props", true);
    const props = gen.var("props", (0, codegen_1._) `{}`);
    if (ps !== undefined)
        setEvaluated(gen, props, ps);
    return props;
}
exports.evaluatedPropsToName = evaluatedPropsToName;
function setEvaluated(gen, props, ps) {
    Object.keys(ps).forEach((p) => gen.assign((0, codegen_1._) `${props}${(0, codegen_1.getProperty)(p)}`, true));
}
__webpack_unused_export__ = setEvaluated;
const snippets = {};
function useFunc(gen, f) {
    return gen.scopeValue("func", {
        ref: f,
        code: snippets[f.code] || (snippets[f.code] = new code_1._Code(f.code)),
    });
}
exports.useFunc = useFunc;
var Type;
(function (Type) {
    Type[Type["Num"] = 0] = "Num";
    Type[Type["Str"] = 1] = "Str";
})(Type || (exports.Type = Type = {}));
function getErrorPath(dataProp, dataPropType, jsPropertySyntax) {
    // let path
    if (dataProp instanceof codegen_1.Name) {
        const isNumber = dataPropType === Type.Num;
        return jsPropertySyntax
            ? isNumber
                ? (0, codegen_1._) `"[" + ${dataProp} + "]"`
                : (0, codegen_1._) `"['" + ${dataProp} + "']"`
            : isNumber
                ? (0, codegen_1._) `"/" + ${dataProp}`
                : (0, codegen_1._) `"/" + ${dataProp}.replace(/~/g, "~0").replace(/\\//g, "~1")`; // TODO maybe use global escapePointer
    }
    return jsPropertySyntax ? (0, codegen_1.getProperty)(dataProp).toString() : "/" + escapeJsonPointer(dataProp);
}
exports.getErrorPath = getErrorPath;
function checkStrictMode(it, msg, mode = it.opts.strictSchema) {
    if (!mode)
        return;
    msg = `strict mode: ${msg}`;
    if (mode === true)
        throw new Error(msg);
    it.self.logger.warn(msg);
}
exports.checkStrictMode = checkStrictMode;
//# sourceMappingURL=util.js.map

},
59039(__unused_rspack_module, exports) {
var __webpack_unused_export__;

__webpack_unused_export__ = ({ value: true });
exports.shouldUseRule = exports.shouldUseGroup = exports.schemaHasRulesForType = void 0;
function schemaHasRulesForType({ schema, self }, type) {
    const group = self.RULES.types[type];
    return group && group !== true && shouldUseGroup(schema, group);
}
exports.schemaHasRulesForType = schemaHasRulesForType;
function shouldUseGroup(schema, group) {
    return group.rules.some((rule) => shouldUseRule(schema, rule));
}
exports.shouldUseGroup = shouldUseGroup;
function shouldUseRule(schema, rule) {
    var _a;
    return (schema[rule.keyword] !== undefined ||
        ((_a = rule.definition.implements) === null || _a === void 0 ? void 0 : _a.some((kwd) => schema[kwd] !== undefined)));
}
exports.shouldUseRule = shouldUseRule;
//# sourceMappingURL=applicability.js.map

},
76199(__unused_rspack_module, exports, __webpack_require__) {
var __webpack_unused_export__;

__webpack_unused_export__ = ({ value: true });
exports.boolOrEmptySchema = exports.topBoolOrEmptySchema = void 0;
const errors_1 = __webpack_require__(16660);
const codegen_1 = __webpack_require__(48325);
const names_1 = __webpack_require__(28727);
const boolError = {
    message: "boolean schema is false",
};
function topBoolOrEmptySchema(it) {
    const { gen, schema, validateName } = it;
    if (schema === false) {
        falseSchemaError(it, false);
    }
    else if (typeof schema == "object" && schema.$async === true) {
        gen.return(names_1.default.data);
    }
    else {
        gen.assign((0, codegen_1._) `${validateName}.errors`, null);
        gen.return(true);
    }
}
exports.topBoolOrEmptySchema = topBoolOrEmptySchema;
function boolOrEmptySchema(it, valid) {
    const { gen, schema } = it;
    if (schema === false) {
        gen.var(valid, false); // TODO var
        falseSchemaError(it);
    }
    else {
        gen.var(valid, true); // TODO var
    }
}
exports.boolOrEmptySchema = boolOrEmptySchema;
function falseSchemaError(it, overrideAllErrors) {
    const { gen, data } = it;
    // TODO maybe some other interface should be used for non-keyword validation errors...
    const cxt = {
        gen,
        keyword: "false schema",
        data,
        schema: false,
        schemaCode: false,
        schemaValue: false,
        params: {},
        it,
    };
    (0, errors_1.reportError)(cxt, boolError, undefined, overrideAllErrors);
}
//# sourceMappingURL=boolSchema.js.map

},
87568(__unused_rspack_module, exports, __webpack_require__) {
var __webpack_unused_export__;

__webpack_unused_export__ = ({ value: true });
exports.reportTypeError = exports.checkDataTypes = exports.checkDataType = exports.coerceAndCheckDataType = exports.getJSONTypes = exports.getSchemaTypes = exports.DataType = void 0;
const rules_1 = __webpack_require__(21228);
const applicability_1 = __webpack_require__(59039);
const errors_1 = __webpack_require__(16660);
const codegen_1 = __webpack_require__(48325);
const util_1 = __webpack_require__(53571);
var DataType;
(function (DataType) {
    DataType[DataType["Correct"] = 0] = "Correct";
    DataType[DataType["Wrong"] = 1] = "Wrong";
})(DataType || (exports.DataType = DataType = {}));
function getSchemaTypes(schema) {
    const types = getJSONTypes(schema.type);
    const hasNull = types.includes("null");
    if (hasNull) {
        if (schema.nullable === false)
            throw new Error("type: null contradicts nullable: false");
    }
    else {
        if (!types.length && schema.nullable !== undefined) {
            throw new Error('"nullable" cannot be used without "type"');
        }
        if (schema.nullable === true)
            types.push("null");
    }
    return types;
}
exports.getSchemaTypes = getSchemaTypes;
// eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
function getJSONTypes(ts) {
    const types = Array.isArray(ts) ? ts : ts ? [ts] : [];
    if (types.every(rules_1.isJSONType))
        return types;
    throw new Error("type must be JSONType or JSONType[]: " + types.join(","));
}
exports.getJSONTypes = getJSONTypes;
function coerceAndCheckDataType(it, types) {
    const { gen, data, opts } = it;
    const coerceTo = coerceToTypes(types, opts.coerceTypes);
    const checkTypes = types.length > 0 &&
        !(coerceTo.length === 0 && types.length === 1 && (0, applicability_1.schemaHasRulesForType)(it, types[0]));
    if (checkTypes) {
        const wrongType = checkDataTypes(types, data, opts.strictNumbers, DataType.Wrong);
        gen.if(wrongType, () => {
            if (coerceTo.length)
                coerceData(it, types, coerceTo);
            else
                reportTypeError(it);
        });
    }
    return checkTypes;
}
exports.coerceAndCheckDataType = coerceAndCheckDataType;
const COERCIBLE = new Set(["string", "number", "integer", "boolean", "null"]);
function coerceToTypes(types, coerceTypes) {
    return coerceTypes
        ? types.filter((t) => COERCIBLE.has(t) || (coerceTypes === "array" && t === "array"))
        : [];
}
function coerceData(it, types, coerceTo) {
    const { gen, data, opts } = it;
    const dataType = gen.let("dataType", (0, codegen_1._) `typeof ${data}`);
    const coerced = gen.let("coerced", (0, codegen_1._) `undefined`);
    if (opts.coerceTypes === "array") {
        gen.if((0, codegen_1._) `${dataType} == 'object' && Array.isArray(${data}) && ${data}.length == 1`, () => gen
            .assign(data, (0, codegen_1._) `${data}[0]`)
            .assign(dataType, (0, codegen_1._) `typeof ${data}`)
            .if(checkDataTypes(types, data, opts.strictNumbers), () => gen.assign(coerced, data)));
    }
    gen.if((0, codegen_1._) `${coerced} !== undefined`);
    for (const t of coerceTo) {
        if (COERCIBLE.has(t) || (t === "array" && opts.coerceTypes === "array")) {
            coerceSpecificType(t);
        }
    }
    gen.else();
    reportTypeError(it);
    gen.endIf();
    gen.if((0, codegen_1._) `${coerced} !== undefined`, () => {
        gen.assign(data, coerced);
        assignParentData(it, coerced);
    });
    function coerceSpecificType(t) {
        switch (t) {
            case "string":
                gen
                    .elseIf((0, codegen_1._) `${dataType} == "number" || ${dataType} == "boolean"`)
                    .assign(coerced, (0, codegen_1._) `"" + ${data}`)
                    .elseIf((0, codegen_1._) `${data} === null`)
                    .assign(coerced, (0, codegen_1._) `""`);
                return;
            case "number":
                gen
                    .elseIf((0, codegen_1._) `${dataType} == "boolean" || ${data} === null
              || (${dataType} == "string" && ${data} && ${data} == +${data})`)
                    .assign(coerced, (0, codegen_1._) `+${data}`);
                return;
            case "integer":
                gen
                    .elseIf((0, codegen_1._) `${dataType} === "boolean" || ${data} === null
              || (${dataType} === "string" && ${data} && ${data} == +${data} && !(${data} % 1))`)
                    .assign(coerced, (0, codegen_1._) `+${data}`);
                return;
            case "boolean":
                gen
                    .elseIf((0, codegen_1._) `${data} === "false" || ${data} === 0 || ${data} === null`)
                    .assign(coerced, false)
                    .elseIf((0, codegen_1._) `${data} === "true" || ${data} === 1`)
                    .assign(coerced, true);
                return;
            case "null":
                gen.elseIf((0, codegen_1._) `${data} === "" || ${data} === 0 || ${data} === false`);
                gen.assign(coerced, null);
                return;
            case "array":
                gen
                    .elseIf((0, codegen_1._) `${dataType} === "string" || ${dataType} === "number"
              || ${dataType} === "boolean" || ${data} === null`)
                    .assign(coerced, (0, codegen_1._) `[${data}]`);
        }
    }
}
function assignParentData({ gen, parentData, parentDataProperty }, expr) {
    // TODO use gen.property
    gen.if((0, codegen_1._) `${parentData} !== undefined`, () => gen.assign((0, codegen_1._) `${parentData}[${parentDataProperty}]`, expr));
}
function checkDataType(dataType, data, strictNums, correct = DataType.Correct) {
    const EQ = correct === DataType.Correct ? codegen_1.operators.EQ : codegen_1.operators.NEQ;
    let cond;
    switch (dataType) {
        case "null":
            return (0, codegen_1._) `${data} ${EQ} null`;
        case "array":
            cond = (0, codegen_1._) `Array.isArray(${data})`;
            break;
        case "object":
            cond = (0, codegen_1._) `${data} && typeof ${data} == "object" && !Array.isArray(${data})`;
            break;
        case "integer":
            cond = numCond((0, codegen_1._) `!(${data} % 1) && !isNaN(${data})`);
            break;
        case "number":
            cond = numCond();
            break;
        default:
            return (0, codegen_1._) `typeof ${data} ${EQ} ${dataType}`;
    }
    return correct === DataType.Correct ? cond : (0, codegen_1.not)(cond);
    function numCond(_cond = codegen_1.nil) {
        return (0, codegen_1.and)((0, codegen_1._) `typeof ${data} == "number"`, _cond, strictNums ? (0, codegen_1._) `isFinite(${data})` : codegen_1.nil);
    }
}
exports.checkDataType = checkDataType;
function checkDataTypes(dataTypes, data, strictNums, correct) {
    if (dataTypes.length === 1) {
        return checkDataType(dataTypes[0], data, strictNums, correct);
    }
    let cond;
    const types = (0, util_1.toHash)(dataTypes);
    if (types.array && types.object) {
        const notObj = (0, codegen_1._) `typeof ${data} != "object"`;
        cond = types.null ? notObj : (0, codegen_1._) `!${data} || ${notObj}`;
        delete types.null;
        delete types.array;
        delete types.object;
    }
    else {
        cond = codegen_1.nil;
    }
    if (types.number)
        delete types.integer;
    for (const t in types)
        cond = (0, codegen_1.and)(cond, checkDataType(t, data, strictNums, correct));
    return cond;
}
exports.checkDataTypes = checkDataTypes;
const typeError = {
    message: ({ schema }) => `must be ${schema}`,
    params: ({ schema, schemaValue }) => typeof schema == "string" ? (0, codegen_1._) `{type: ${schema}}` : (0, codegen_1._) `{type: ${schemaValue}}`,
};
function reportTypeError(it) {
    const cxt = getTypeErrorContext(it);
    (0, errors_1.reportError)(cxt, typeError);
}
exports.reportTypeError = reportTypeError;
function getTypeErrorContext(it) {
    const { gen, data, schema } = it;
    const schemaCode = (0, util_1.schemaRefOrVal)(it, schema, "type");
    return {
        gen,
        keyword: "type",
        data,
        schema: schema.type,
        schemaCode,
        schemaValue: schemaCode,
        parentSchema: schema,
        params: {},
        it,
    };
}
//# sourceMappingURL=dataType.js.map

},
90798(__unused_rspack_module, exports, __webpack_require__) {
var __webpack_unused_export__;

__webpack_unused_export__ = ({ value: true });
exports.assignDefaults = void 0;
const codegen_1 = __webpack_require__(48325);
const util_1 = __webpack_require__(53571);
function assignDefaults(it, ty) {
    const { properties, items } = it.schema;
    if (ty === "object" && properties) {
        for (const key in properties) {
            assignDefault(it, key, properties[key].default);
        }
    }
    else if (ty === "array" && Array.isArray(items)) {
        items.forEach((sch, i) => assignDefault(it, i, sch.default));
    }
}
exports.assignDefaults = assignDefaults;
function assignDefault(it, prop, defaultValue) {
    const { gen, compositeRule, data, opts } = it;
    if (defaultValue === undefined)
        return;
    const childData = (0, codegen_1._) `${data}${(0, codegen_1.getProperty)(prop)}`;
    if (compositeRule) {
        (0, util_1.checkStrictMode)(it, `default is ignored for: ${childData}`);
        return;
    }
    let condition = (0, codegen_1._) `${childData} === undefined`;
    if (opts.useDefaults === "empty") {
        condition = (0, codegen_1._) `${condition} || ${childData} === null || ${childData} === ""`;
    }
    // `${childData} === undefined` +
    // (opts.useDefaults === "empty" ? ` || ${childData} === null || ${childData} === ""` : "")
    gen.if(condition, (0, codegen_1._) `${childData} = ${(0, codegen_1.stringify)(defaultValue)}`);
}
//# sourceMappingURL=defaults.js.map

},
42890(__unused_rspack_module, exports, __webpack_require__) {

Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.getData = exports.KeywordCxt = exports.validateFunctionCode = void 0;
const boolSchema_1 = __webpack_require__(76199);
const dataType_1 = __webpack_require__(87568);
const applicability_1 = __webpack_require__(59039);
const dataType_2 = __webpack_require__(87568);
const defaults_1 = __webpack_require__(90798);
const keyword_1 = __webpack_require__(2777);
const subschema_1 = __webpack_require__(75839);
const codegen_1 = __webpack_require__(48325);
const names_1 = __webpack_require__(28727);
const resolve_1 = __webpack_require__(87307);
const util_1 = __webpack_require__(53571);
const errors_1 = __webpack_require__(16660);
// schema compilation - generates validation function, subschemaCode (below) is used for subschemas
function validateFunctionCode(it) {
    if (isSchemaObj(it)) {
        checkKeywords(it);
        if (schemaCxtHasRules(it)) {
            topSchemaObjCode(it);
            return;
        }
    }
    validateFunction(it, () => (0, boolSchema_1.topBoolOrEmptySchema)(it));
}
exports.validateFunctionCode = validateFunctionCode;
function validateFunction({ gen, validateName, schema, schemaEnv, opts }, body) {
    if (opts.code.es5) {
        gen.func(validateName, (0, codegen_1._) `${names_1.default.data}, ${names_1.default.valCxt}`, schemaEnv.$async, () => {
            gen.code((0, codegen_1._) `"use strict"; ${funcSourceUrl(schema, opts)}`);
            destructureValCxtES5(gen, opts);
            gen.code(body);
        });
    }
    else {
        gen.func(validateName, (0, codegen_1._) `${names_1.default.data}, ${destructureValCxt(opts)}`, schemaEnv.$async, () => gen.code(funcSourceUrl(schema, opts)).code(body));
    }
}
function destructureValCxt(opts) {
    return (0, codegen_1._) `{${names_1.default.instancePath}="", ${names_1.default.parentData}, ${names_1.default.parentDataProperty}, ${names_1.default.rootData}=${names_1.default.data}${opts.dynamicRef ? (0, codegen_1._) `, ${names_1.default.dynamicAnchors}={}` : codegen_1.nil}}={}`;
}
function destructureValCxtES5(gen, opts) {
    gen.if(names_1.default.valCxt, () => {
        gen.var(names_1.default.instancePath, (0, codegen_1._) `${names_1.default.valCxt}.${names_1.default.instancePath}`);
        gen.var(names_1.default.parentData, (0, codegen_1._) `${names_1.default.valCxt}.${names_1.default.parentData}`);
        gen.var(names_1.default.parentDataProperty, (0, codegen_1._) `${names_1.default.valCxt}.${names_1.default.parentDataProperty}`);
        gen.var(names_1.default.rootData, (0, codegen_1._) `${names_1.default.valCxt}.${names_1.default.rootData}`);
        if (opts.dynamicRef)
            gen.var(names_1.default.dynamicAnchors, (0, codegen_1._) `${names_1.default.valCxt}.${names_1.default.dynamicAnchors}`);
    }, () => {
        gen.var(names_1.default.instancePath, (0, codegen_1._) `""`);
        gen.var(names_1.default.parentData, (0, codegen_1._) `undefined`);
        gen.var(names_1.default.parentDataProperty, (0, codegen_1._) `undefined`);
        gen.var(names_1.default.rootData, names_1.default.data);
        if (opts.dynamicRef)
            gen.var(names_1.default.dynamicAnchors, (0, codegen_1._) `{}`);
    });
}
function topSchemaObjCode(it) {
    const { schema, opts, gen } = it;
    validateFunction(it, () => {
        if (opts.$comment && schema.$comment)
            commentKeyword(it);
        checkNoDefault(it);
        gen.let(names_1.default.vErrors, null);
        gen.let(names_1.default.errors, 0);
        if (opts.unevaluated)
            resetEvaluated(it);
        typeAndKeywords(it);
        returnResults(it);
    });
    return;
}
function resetEvaluated(it) {
    // TODO maybe some hook to execute it in the end to check whether props/items are Name, as in assignEvaluated
    const { gen, validateName } = it;
    it.evaluated = gen.const("evaluated", (0, codegen_1._) `${validateName}.evaluated`);
    gen.if((0, codegen_1._) `${it.evaluated}.dynamicProps`, () => gen.assign((0, codegen_1._) `${it.evaluated}.props`, (0, codegen_1._) `undefined`));
    gen.if((0, codegen_1._) `${it.evaluated}.dynamicItems`, () => gen.assign((0, codegen_1._) `${it.evaluated}.items`, (0, codegen_1._) `undefined`));
}
function funcSourceUrl(schema, opts) {
    const schId = typeof schema == "object" && schema[opts.schemaId];
    return schId && (opts.code.source || opts.code.process) ? (0, codegen_1._) `/*# sourceURL=${schId} */` : codegen_1.nil;
}
// schema compilation - this function is used recursively to generate code for sub-schemas
function subschemaCode(it, valid) {
    if (isSchemaObj(it)) {
        checkKeywords(it);
        if (schemaCxtHasRules(it)) {
            subSchemaObjCode(it, valid);
            return;
        }
    }
    (0, boolSchema_1.boolOrEmptySchema)(it, valid);
}
function schemaCxtHasRules({ schema, self }) {
    if (typeof schema == "boolean")
        return !schema;
    for (const key in schema)
        if (self.RULES.all[key])
            return true;
    return false;
}
function isSchemaObj(it) {
    return typeof it.schema != "boolean";
}
function subSchemaObjCode(it, valid) {
    const { schema, gen, opts } = it;
    if (opts.$comment && schema.$comment)
        commentKeyword(it);
    updateContext(it);
    checkAsyncSchema(it);
    const errsCount = gen.const("_errs", names_1.default.errors);
    typeAndKeywords(it, errsCount);
    // TODO var
    gen.var(valid, (0, codegen_1._) `${errsCount} === ${names_1.default.errors}`);
}
function checkKeywords(it) {
    (0, util_1.checkUnknownRules)(it);
    checkRefsAndKeywords(it);
}
function typeAndKeywords(it, errsCount) {
    if (it.opts.jtd)
        return schemaKeywords(it, [], false, errsCount);
    const types = (0, dataType_1.getSchemaTypes)(it.schema);
    const checkedTypes = (0, dataType_1.coerceAndCheckDataType)(it, types);
    schemaKeywords(it, types, !checkedTypes, errsCount);
}
function checkRefsAndKeywords(it) {
    const { schema, errSchemaPath, opts, self } = it;
    if (schema.$ref && opts.ignoreKeywordsWithRef && (0, util_1.schemaHasRulesButRef)(schema, self.RULES)) {
        self.logger.warn(`$ref: keywords ignored in schema at path "${errSchemaPath}"`);
    }
}
function checkNoDefault(it) {
    const { schema, opts } = it;
    if (schema.default !== undefined && opts.useDefaults && opts.strictSchema) {
        (0, util_1.checkStrictMode)(it, "default is ignored in the schema root");
    }
}
function updateContext(it) {
    const schId = it.schema[it.opts.schemaId];
    if (schId)
        it.baseId = (0, resolve_1.resolveUrl)(it.opts.uriResolver, it.baseId, schId);
}
function checkAsyncSchema(it) {
    if (it.schema.$async && !it.schemaEnv.$async)
        throw new Error("async schema in sync schema");
}
function commentKeyword({ gen, schemaEnv, schema, errSchemaPath, opts }) {
    const msg = schema.$comment;
    if (opts.$comment === true) {
        gen.code((0, codegen_1._) `${names_1.default.self}.logger.log(${msg})`);
    }
    else if (typeof opts.$comment == "function") {
        const schemaPath = (0, codegen_1.str) `${errSchemaPath}/$comment`;
        const rootName = gen.scopeValue("root", { ref: schemaEnv.root });
        gen.code((0, codegen_1._) `${names_1.default.self}.opts.$comment(${msg}, ${schemaPath}, ${rootName}.schema)`);
    }
}
function returnResults(it) {
    const { gen, schemaEnv, validateName, ValidationError, opts } = it;
    if (schemaEnv.$async) {
        // TODO assign unevaluated
        gen.if((0, codegen_1._) `${names_1.default.errors} === 0`, () => gen.return(names_1.default.data), () => gen.throw((0, codegen_1._) `new ${ValidationError}(${names_1.default.vErrors})`));
    }
    else {
        gen.assign((0, codegen_1._) `${validateName}.errors`, names_1.default.vErrors);
        if (opts.unevaluated)
            assignEvaluated(it);
        gen.return((0, codegen_1._) `${names_1.default.errors} === 0`);
    }
}
function assignEvaluated({ gen, evaluated, props, items }) {
    if (props instanceof codegen_1.Name)
        gen.assign((0, codegen_1._) `${evaluated}.props`, props);
    if (items instanceof codegen_1.Name)
        gen.assign((0, codegen_1._) `${evaluated}.items`, items);
}
function schemaKeywords(it, types, typeErrors, errsCount) {
    const { gen, schema, data, allErrors, opts, self } = it;
    const { RULES } = self;
    if (schema.$ref && (opts.ignoreKeywordsWithRef || !(0, util_1.schemaHasRulesButRef)(schema, RULES))) {
        gen.block(() => keywordCode(it, "$ref", RULES.all.$ref.definition)); // TODO typecast
        return;
    }
    if (!opts.jtd)
        checkStrictTypes(it, types);
    gen.block(() => {
        for (const group of RULES.rules)
            groupKeywords(group);
        groupKeywords(RULES.post);
    });
    function groupKeywords(group) {
        if (!(0, applicability_1.shouldUseGroup)(schema, group))
            return;
        if (group.type) {
            gen.if((0, dataType_2.checkDataType)(group.type, data, opts.strictNumbers));
            iterateKeywords(it, group);
            if (types.length === 1 && types[0] === group.type && typeErrors) {
                gen.else();
                (0, dataType_2.reportTypeError)(it);
            }
            gen.endIf();
        }
        else {
            iterateKeywords(it, group);
        }
        // TODO make it "ok" call?
        if (!allErrors)
            gen.if((0, codegen_1._) `${names_1.default.errors} === ${errsCount || 0}`);
    }
}
function iterateKeywords(it, group) {
    const { gen, schema, opts: { useDefaults }, } = it;
    if (useDefaults)
        (0, defaults_1.assignDefaults)(it, group.type);
    gen.block(() => {
        for (const rule of group.rules) {
            if ((0, applicability_1.shouldUseRule)(schema, rule)) {
                keywordCode(it, rule.keyword, rule.definition, group.type);
            }
        }
    });
}
function checkStrictTypes(it, types) {
    if (it.schemaEnv.meta || !it.opts.strictTypes)
        return;
    checkContextTypes(it, types);
    if (!it.opts.allowUnionTypes)
        checkMultipleTypes(it, types);
    checkKeywordTypes(it, it.dataTypes);
}
function checkContextTypes(it, types) {
    if (!types.length)
        return;
    if (!it.dataTypes.length) {
        it.dataTypes = types;
        return;
    }
    types.forEach((t) => {
        if (!includesType(it.dataTypes, t)) {
            strictTypesError(it, `type "${t}" not allowed by context "${it.dataTypes.join(",")}"`);
        }
    });
    narrowSchemaTypes(it, types);
}
function checkMultipleTypes(it, ts) {
    if (ts.length > 1 && !(ts.length === 2 && ts.includes("null"))) {
        strictTypesError(it, "use allowUnionTypes to allow union type keyword");
    }
}
function checkKeywordTypes(it, ts) {
    const rules = it.self.RULES.all;
    for (const keyword in rules) {
        const rule = rules[keyword];
        if (typeof rule == "object" && (0, applicability_1.shouldUseRule)(it.schema, rule)) {
            const { type } = rule.definition;
            if (type.length && !type.some((t) => hasApplicableType(ts, t))) {
                strictTypesError(it, `missing type "${type.join(",")}" for keyword "${keyword}"`);
            }
        }
    }
}
function hasApplicableType(schTs, kwdT) {
    return schTs.includes(kwdT) || (kwdT === "number" && schTs.includes("integer"));
}
function includesType(ts, t) {
    return ts.includes(t) || (t === "integer" && ts.includes("number"));
}
function narrowSchemaTypes(it, withTypes) {
    const ts = [];
    for (const t of it.dataTypes) {
        if (includesType(withTypes, t))
            ts.push(t);
        else if (withTypes.includes("integer") && t === "number")
            ts.push("integer");
    }
    it.dataTypes = ts;
}
function strictTypesError(it, msg) {
    const schemaPath = it.schemaEnv.baseId + it.errSchemaPath;
    msg += ` at "${schemaPath}" (strictTypes)`;
    (0, util_1.checkStrictMode)(it, msg, it.opts.strictTypes);
}
class KeywordCxt {
    constructor(it, def, keyword) {
        (0, keyword_1.validateKeywordUsage)(it, def, keyword);
        this.gen = it.gen;
        this.allErrors = it.allErrors;
        this.keyword = keyword;
        this.data = it.data;
        this.schema = it.schema[keyword];
        this.$data = def.$data && it.opts.$data && this.schema && this.schema.$data;
        this.schemaValue = (0, util_1.schemaRefOrVal)(it, this.schema, keyword, this.$data);
        this.schemaType = def.schemaType;
        this.parentSchema = it.schema;
        this.params = {};
        this.it = it;
        this.def = def;
        if (this.$data) {
            this.schemaCode = it.gen.const("vSchema", getData(this.$data, it));
        }
        else {
            this.schemaCode = this.schemaValue;
            if (!(0, keyword_1.validSchemaType)(this.schema, def.schemaType, def.allowUndefined)) {
                throw new Error(`${keyword} value must be ${JSON.stringify(def.schemaType)}`);
            }
        }
        if ("code" in def ? def.trackErrors : def.errors !== false) {
            this.errsCount = it.gen.const("_errs", names_1.default.errors);
        }
    }
    result(condition, successAction, failAction) {
        this.failResult((0, codegen_1.not)(condition), successAction, failAction);
    }
    failResult(condition, successAction, failAction) {
        this.gen.if(condition);
        if (failAction)
            failAction();
        else
            this.error();
        if (successAction) {
            this.gen.else();
            successAction();
            if (this.allErrors)
                this.gen.endIf();
        }
        else {
            if (this.allErrors)
                this.gen.endIf();
            else
                this.gen.else();
        }
    }
    pass(condition, failAction) {
        this.failResult((0, codegen_1.not)(condition), undefined, failAction);
    }
    fail(condition) {
        if (condition === undefined) {
            this.error();
            if (!this.allErrors)
                this.gen.if(false); // this branch will be removed by gen.optimize
            return;
        }
        this.gen.if(condition);
        this.error();
        if (this.allErrors)
            this.gen.endIf();
        else
            this.gen.else();
    }
    fail$data(condition) {
        if (!this.$data)
            return this.fail(condition);
        const { schemaCode } = this;
        this.fail((0, codegen_1._) `${schemaCode} !== undefined && (${(0, codegen_1.or)(this.invalid$data(), condition)})`);
    }
    error(append, errorParams, errorPaths) {
        if (errorParams) {
            this.setParams(errorParams);
            this._error(append, errorPaths);
            this.setParams({});
            return;
        }
        this._error(append, errorPaths);
    }
    _error(append, errorPaths) {
        ;
        (append ? errors_1.reportExtraError : errors_1.reportError)(this, this.def.error, errorPaths);
    }
    $dataError() {
        (0, errors_1.reportError)(this, this.def.$dataError || errors_1.keyword$DataError);
    }
    reset() {
        if (this.errsCount === undefined)
            throw new Error('add "trackErrors" to keyword definition');
        (0, errors_1.resetErrorsCount)(this.gen, this.errsCount);
    }
    ok(cond) {
        if (!this.allErrors)
            this.gen.if(cond);
    }
    setParams(obj, assign) {
        if (assign)
            Object.assign(this.params, obj);
        else
            this.params = obj;
    }
    block$data(valid, codeBlock, $dataValid = codegen_1.nil) {
        this.gen.block(() => {
            this.check$data(valid, $dataValid);
            codeBlock();
        });
    }
    check$data(valid = codegen_1.nil, $dataValid = codegen_1.nil) {
        if (!this.$data)
            return;
        const { gen, schemaCode, schemaType, def } = this;
        gen.if((0, codegen_1.or)((0, codegen_1._) `${schemaCode} === undefined`, $dataValid));
        if (valid !== codegen_1.nil)
            gen.assign(valid, true);
        if (schemaType.length || def.validateSchema) {
            gen.elseIf(this.invalid$data());
            this.$dataError();
            if (valid !== codegen_1.nil)
                gen.assign(valid, false);
        }
        gen.else();
    }
    invalid$data() {
        const { gen, schemaCode, schemaType, def, it } = this;
        return (0, codegen_1.or)(wrong$DataType(), invalid$DataSchema());
        function wrong$DataType() {
            if (schemaType.length) {
                /* istanbul ignore if */
                if (!(schemaCode instanceof codegen_1.Name))
                    throw new Error("ajv implementation error");
                const st = Array.isArray(schemaType) ? schemaType : [schemaType];
                return (0, codegen_1._) `${(0, dataType_2.checkDataTypes)(st, schemaCode, it.opts.strictNumbers, dataType_2.DataType.Wrong)}`;
            }
            return codegen_1.nil;
        }
        function invalid$DataSchema() {
            if (def.validateSchema) {
                const validateSchemaRef = gen.scopeValue("validate$data", { ref: def.validateSchema }); // TODO value.code for standalone
                return (0, codegen_1._) `!${validateSchemaRef}(${schemaCode})`;
            }
            return codegen_1.nil;
        }
    }
    subschema(appl, valid) {
        const subschema = (0, subschema_1.getSubschema)(this.it, appl);
        (0, subschema_1.extendSubschemaData)(subschema, this.it, appl);
        (0, subschema_1.extendSubschemaMode)(subschema, appl);
        const nextContext = { ...this.it, ...subschema, items: undefined, props: undefined };
        subschemaCode(nextContext, valid);
        return nextContext;
    }
    mergeEvaluated(schemaCxt, toName) {
        const { it, gen } = this;
        if (!it.opts.unevaluated)
            return;
        if (it.props !== true && schemaCxt.props !== undefined) {
            it.props = util_1.mergeEvaluated.props(gen, schemaCxt.props, it.props, toName);
        }
        if (it.items !== true && schemaCxt.items !== undefined) {
            it.items = util_1.mergeEvaluated.items(gen, schemaCxt.items, it.items, toName);
        }
    }
    mergeValidEvaluated(schemaCxt, valid) {
        const { it, gen } = this;
        if (it.opts.unevaluated && (it.props !== true || it.items !== true)) {
            gen.if(valid, () => this.mergeEvaluated(schemaCxt, codegen_1.Name));
            return true;
        }
    }
}
exports.KeywordCxt = KeywordCxt;
function keywordCode(it, keyword, def, ruleType) {
    const cxt = new KeywordCxt(it, def, keyword);
    if ("code" in def) {
        def.code(cxt, ruleType);
    }
    else if (cxt.$data && def.validate) {
        (0, keyword_1.funcKeywordCode)(cxt, def);
    }
    else if ("macro" in def) {
        (0, keyword_1.macroKeywordCode)(cxt, def);
    }
    else if (def.compile || def.validate) {
        (0, keyword_1.funcKeywordCode)(cxt, def);
    }
}
const JSON_POINTER = /^\/(?:[^~]|~0|~1)*$/;
const RELATIVE_JSON_POINTER = /^([0-9]+)(#|\/(?:[^~]|~0|~1)*)?$/;
function getData($data, { dataLevel, dataNames, dataPathArr }) {
    let jsonPointer;
    let data;
    if ($data === "")
        return names_1.default.rootData;
    if ($data[0] === "/") {
        if (!JSON_POINTER.test($data))
            throw new Error(`Invalid JSON-pointer: ${$data}`);
        jsonPointer = $data;
        data = names_1.default.rootData;
    }
    else {
        const matches = RELATIVE_JSON_POINTER.exec($data);
        if (!matches)
            throw new Error(`Invalid JSON-pointer: ${$data}`);
        const up = +matches[1];
        jsonPointer = matches[2];
        if (jsonPointer === "#") {
            if (up >= dataLevel)
                throw new Error(errorMsg("property/index", up));
            return dataPathArr[dataLevel - up];
        }
        if (up > dataLevel)
            throw new Error(errorMsg("data", up));
        data = dataNames[dataLevel - up];
        if (!jsonPointer)
            return data;
    }
    let expr = data;
    const segments = jsonPointer.split("/");
    for (const segment of segments) {
        if (segment) {
            data = (0, codegen_1._) `${data}${(0, codegen_1.getProperty)((0, util_1.unescapeJsonPointer)(segment))}`;
            expr = (0, codegen_1._) `${expr} && ${data}`;
        }
    }
    return expr;
    function errorMsg(pointerType, up) {
        return `Cannot access ${pointerType} ${up} levels up, current level is ${dataLevel}`;
    }
}
exports.getData = getData;
//# sourceMappingURL=index.js.map

},
2777(__unused_rspack_module, exports, __webpack_require__) {
var __webpack_unused_export__;

__webpack_unused_export__ = ({ value: true });
exports.validateKeywordUsage = exports.validSchemaType = exports.funcKeywordCode = exports.macroKeywordCode = void 0;
const codegen_1 = __webpack_require__(48325);
const names_1 = __webpack_require__(28727);
const code_1 = __webpack_require__(3493);
const errors_1 = __webpack_require__(16660);
function macroKeywordCode(cxt, def) {
    const { gen, keyword, schema, parentSchema, it } = cxt;
    const macroSchema = def.macro.call(it.self, schema, parentSchema, it);
    const schemaRef = useKeyword(gen, keyword, macroSchema);
    if (it.opts.validateSchema !== false)
        it.self.validateSchema(macroSchema, true);
    const valid = gen.name("valid");
    cxt.subschema({
        schema: macroSchema,
        schemaPath: codegen_1.nil,
        errSchemaPath: `${it.errSchemaPath}/${keyword}`,
        topSchemaRef: schemaRef,
        compositeRule: true,
    }, valid);
    cxt.pass(valid, () => cxt.error(true));
}
exports.macroKeywordCode = macroKeywordCode;
function funcKeywordCode(cxt, def) {
    var _a;
    const { gen, keyword, schema, parentSchema, $data, it } = cxt;
    checkAsyncKeyword(it, def);
    const validate = !$data && def.compile ? def.compile.call(it.self, schema, parentSchema, it) : def.validate;
    const validateRef = useKeyword(gen, keyword, validate);
    const valid = gen.let("valid");
    cxt.block$data(valid, validateKeyword);
    cxt.ok((_a = def.valid) !== null && _a !== void 0 ? _a : valid);
    function validateKeyword() {
        if (def.errors === false) {
            assignValid();
            if (def.modifying)
                modifyData(cxt);
            reportErrs(() => cxt.error());
        }
        else {
            const ruleErrs = def.async ? validateAsync() : validateSync();
            if (def.modifying)
                modifyData(cxt);
            reportErrs(() => addErrs(cxt, ruleErrs));
        }
    }
    function validateAsync() {
        const ruleErrs = gen.let("ruleErrs", null);
        gen.try(() => assignValid((0, codegen_1._) `await `), (e) => gen.assign(valid, false).if((0, codegen_1._) `${e} instanceof ${it.ValidationError}`, () => gen.assign(ruleErrs, (0, codegen_1._) `${e}.errors`), () => gen.throw(e)));
        return ruleErrs;
    }
    function validateSync() {
        const validateErrs = (0, codegen_1._) `${validateRef}.errors`;
        gen.assign(validateErrs, null);
        assignValid(codegen_1.nil);
        return validateErrs;
    }
    function assignValid(_await = def.async ? (0, codegen_1._) `await ` : codegen_1.nil) {
        const passCxt = it.opts.passContext ? names_1.default.this : names_1.default.self;
        const passSchema = !(("compile" in def && !$data) || def.schema === false);
        gen.assign(valid, (0, codegen_1._) `${_await}${(0, code_1.callValidateCode)(cxt, validateRef, passCxt, passSchema)}`, def.modifying);
    }
    function reportErrs(errors) {
        var _a;
        gen.if((0, codegen_1.not)((_a = def.valid) !== null && _a !== void 0 ? _a : valid), errors);
    }
}
exports.funcKeywordCode = funcKeywordCode;
function modifyData(cxt) {
    const { gen, data, it } = cxt;
    gen.if(it.parentData, () => gen.assign(data, (0, codegen_1._) `${it.parentData}[${it.parentDataProperty}]`));
}
function addErrs(cxt, errs) {
    const { gen } = cxt;
    gen.if((0, codegen_1._) `Array.isArray(${errs})`, () => {
        gen
            .assign(names_1.default.vErrors, (0, codegen_1._) `${names_1.default.vErrors} === null ? ${errs} : ${names_1.default.vErrors}.concat(${errs})`)
            .assign(names_1.default.errors, (0, codegen_1._) `${names_1.default.vErrors}.length`);
        (0, errors_1.extendErrors)(cxt);
    }, () => cxt.error());
}
function checkAsyncKeyword({ schemaEnv }, def) {
    if (def.async && !schemaEnv.$async)
        throw new Error("async keyword in sync schema");
}
function useKeyword(gen, keyword, result) {
    if (result === undefined)
        throw new Error(`keyword "${keyword}" failed to compile`);
    return gen.scopeValue("keyword", typeof result == "function" ? { ref: result } : { ref: result, code: (0, codegen_1.stringify)(result) });
}
function validSchemaType(schema, schemaType, allowUndefined = false) {
    // TODO add tests
    return (!schemaType.length ||
        schemaType.some((st) => st === "array"
            ? Array.isArray(schema)
            : st === "object"
                ? schema && typeof schema == "object" && !Array.isArray(schema)
                : typeof schema == st || (allowUndefined && typeof schema == "undefined")));
}
exports.validSchemaType = validSchemaType;
function validateKeywordUsage({ schema, opts, self, errSchemaPath }, def, keyword) {
    /* istanbul ignore if */
    if (Array.isArray(def.keyword) ? !def.keyword.includes(keyword) : def.keyword !== keyword) {
        throw new Error("ajv implementation error");
    }
    const deps = def.dependencies;
    if (deps === null || deps === void 0 ? void 0 : deps.some((kwd) => !Object.prototype.hasOwnProperty.call(schema, kwd))) {
        throw new Error(`parent schema must have dependencies of ${keyword}: ${deps.join(",")}`);
    }
    if (def.validateSchema) {
        const valid = def.validateSchema(schema[keyword]);
        if (!valid) {
            const msg = `keyword "${keyword}" value is invalid at path "${errSchemaPath}": ` +
                self.errorsText(def.validateSchema.errors);
            if (opts.validateSchema === "log")
                self.logger.error(msg);
            else
                throw new Error(msg);
        }
    }
}
exports.validateKeywordUsage = validateKeywordUsage;
//# sourceMappingURL=keyword.js.map

},
75839(__unused_rspack_module, exports, __webpack_require__) {
var __webpack_unused_export__;

__webpack_unused_export__ = ({ value: true });
exports.extendSubschemaMode = exports.extendSubschemaData = exports.getSubschema = void 0;
const codegen_1 = __webpack_require__(48325);
const util_1 = __webpack_require__(53571);
function getSubschema(it, { keyword, schemaProp, schema, schemaPath, errSchemaPath, topSchemaRef }) {
    if (keyword !== undefined && schema !== undefined) {
        throw new Error('both "keyword" and "schema" passed, only one allowed');
    }
    if (keyword !== undefined) {
        const sch = it.schema[keyword];
        return schemaProp === undefined
            ? {
                schema: sch,
                schemaPath: (0, codegen_1._) `${it.schemaPath}${(0, codegen_1.getProperty)(keyword)}`,
                errSchemaPath: `${it.errSchemaPath}/${keyword}`,
            }
            : {
                schema: sch[schemaProp],
                schemaPath: (0, codegen_1._) `${it.schemaPath}${(0, codegen_1.getProperty)(keyword)}${(0, codegen_1.getProperty)(schemaProp)}`,
                errSchemaPath: `${it.errSchemaPath}/${keyword}/${(0, util_1.escapeFragment)(schemaProp)}`,
            };
    }
    if (schema !== undefined) {
        if (schemaPath === undefined || errSchemaPath === undefined || topSchemaRef === undefined) {
            throw new Error('"schemaPath", "errSchemaPath" and "topSchemaRef" are required with "schema"');
        }
        return {
            schema,
            schemaPath,
            topSchemaRef,
            errSchemaPath,
        };
    }
    throw new Error('either "keyword" or "schema" must be passed');
}
exports.getSubschema = getSubschema;
function extendSubschemaData(subschema, it, { dataProp, dataPropType: dpType, data, dataTypes, propertyName }) {
    if (data !== undefined && dataProp !== undefined) {
        throw new Error('both "data" and "dataProp" passed, only one allowed');
    }
    const { gen } = it;
    if (dataProp !== undefined) {
        const { errorPath, dataPathArr, opts } = it;
        const nextData = gen.let("data", (0, codegen_1._) `${it.data}${(0, codegen_1.getProperty)(dataProp)}`, true);
        dataContextProps(nextData);
        subschema.errorPath = (0, codegen_1.str) `${errorPath}${(0, util_1.getErrorPath)(dataProp, dpType, opts.jsPropertySyntax)}`;
        subschema.parentDataProperty = (0, codegen_1._) `${dataProp}`;
        subschema.dataPathArr = [...dataPathArr, subschema.parentDataProperty];
    }
    if (data !== undefined) {
        const nextData = data instanceof codegen_1.Name ? data : gen.let("data", data, true); // replaceable if used once?
        dataContextProps(nextData);
        if (propertyName !== undefined)
            subschema.propertyName = propertyName;
        // TODO something is possibly wrong here with not changing parentDataProperty and not appending dataPathArr
    }
    if (dataTypes)
        subschema.dataTypes = dataTypes;
    function dataContextProps(_nextData) {
        subschema.data = _nextData;
        subschema.dataLevel = it.dataLevel + 1;
        subschema.dataTypes = [];
        it.definedProperties = new Set();
        subschema.parentData = it.data;
        subschema.dataNames = [...it.dataNames, _nextData];
    }
}
exports.extendSubschemaData = extendSubschemaData;
function extendSubschemaMode(subschema, { jtdDiscriminator, jtdMetadata, compositeRule, createErrors, allErrors }) {
    if (compositeRule !== undefined)
        subschema.compositeRule = compositeRule;
    if (createErrors !== undefined)
        subschema.createErrors = createErrors;
    if (allErrors !== undefined)
        subschema.allErrors = allErrors;
    subschema.jtdDiscriminator = jtdDiscriminator; // not inherited
    subschema.jtdMetadata = jtdMetadata; // not inherited
}
exports.extendSubschemaMode = extendSubschemaMode;
//# sourceMappingURL=subschema.js.map

},
72186(__unused_rspack_module, exports, __webpack_require__) {
var __webpack_unused_export__;

__webpack_unused_export__ = ({ value: true });
__webpack_unused_export__ = __webpack_unused_export__ = __webpack_unused_export__ = __webpack_unused_export__ = __webpack_unused_export__ = __webpack_unused_export__ = __webpack_unused_export__ = void 0;
var validate_1 = __webpack_require__(42890);
__webpack_unused_export__ = ({ enumerable: true, get: function () { return validate_1.KeywordCxt; } });
var codegen_1 = __webpack_require__(48325);
__webpack_unused_export__ = ({ enumerable: true, get: function () { return codegen_1._; } });
__webpack_unused_export__ = ({ enumerable: true, get: function () { return codegen_1.str; } });
__webpack_unused_export__ = ({ enumerable: true, get: function () { return codegen_1.stringify; } });
__webpack_unused_export__ = ({ enumerable: true, get: function () { return codegen_1.nil; } });
__webpack_unused_export__ = ({ enumerable: true, get: function () { return codegen_1.Name; } });
__webpack_unused_export__ = ({ enumerable: true, get: function () { return codegen_1.CodeGen; } });
const validation_error_1 = __webpack_require__(9894);
const ref_error_1 = __webpack_require__(29319);
const rules_1 = __webpack_require__(21228);
const compile_1 = __webpack_require__(53403);
const codegen_2 = __webpack_require__(48325);
const resolve_1 = __webpack_require__(87307);
const dataType_1 = __webpack_require__(87568);
const util_1 = __webpack_require__(53571);
const $dataRefSchema = __webpack_require__(36509);
const uri_1 = __webpack_require__(36024);
const defaultRegExp = (str, flags) => new RegExp(str, flags);
defaultRegExp.code = "new RegExp";
const META_IGNORE_OPTIONS = ["removeAdditional", "useDefaults", "coerceTypes"];
const EXT_SCOPE_NAMES = new Set([
    "validate",
    "serialize",
    "parse",
    "wrapper",
    "root",
    "schema",
    "keyword",
    "pattern",
    "formats",
    "validate$data",
    "func",
    "obj",
    "Error",
]);
const removedOptions = {
    errorDataPath: "",
    format: "`validateFormats: false` can be used instead.",
    nullable: '"nullable" keyword is supported by default.',
    jsonPointers: "Deprecated jsPropertySyntax can be used instead.",
    extendRefs: "Deprecated ignoreKeywordsWithRef can be used instead.",
    missingRefs: "Pass empty schema with $id that should be ignored to ajv.addSchema.",
    processCode: "Use option `code: {process: (code, schemaEnv: object) => string}`",
    sourceCode: "Use option `code: {source: true}`",
    strictDefaults: "It is default now, see option `strict`.",
    strictKeywords: "It is default now, see option `strict`.",
    uniqueItems: '"uniqueItems" keyword is always validated.',
    unknownFormats: "Disable strict mode or pass `true` to `ajv.addFormat` (or `formats` option).",
    cache: "Map is used as cache, schema object as key.",
    serialize: "Map is used as cache, schema object as key.",
    ajvErrors: "It is default now.",
};
const deprecatedOptions = {
    ignoreKeywordsWithRef: "",
    jsPropertySyntax: "",
    unicode: '"minLength"/"maxLength" account for unicode characters by default.',
};
const MAX_EXPRESSION = 200;
// eslint-disable-next-line complexity
function requiredOptions(o) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x, _y, _z, _0;
    const s = o.strict;
    const _optz = (_a = o.code) === null || _a === void 0 ? void 0 : _a.optimize;
    const optimize = _optz === true || _optz === undefined ? 1 : _optz || 0;
    const regExp = (_c = (_b = o.code) === null || _b === void 0 ? void 0 : _b.regExp) !== null && _c !== void 0 ? _c : defaultRegExp;
    const uriResolver = (_d = o.uriResolver) !== null && _d !== void 0 ? _d : uri_1.default;
    return {
        strictSchema: (_f = (_e = o.strictSchema) !== null && _e !== void 0 ? _e : s) !== null && _f !== void 0 ? _f : true,
        strictNumbers: (_h = (_g = o.strictNumbers) !== null && _g !== void 0 ? _g : s) !== null && _h !== void 0 ? _h : true,
        strictTypes: (_k = (_j = o.strictTypes) !== null && _j !== void 0 ? _j : s) !== null && _k !== void 0 ? _k : "log",
        strictTuples: (_m = (_l = o.strictTuples) !== null && _l !== void 0 ? _l : s) !== null && _m !== void 0 ? _m : "log",
        strictRequired: (_p = (_o = o.strictRequired) !== null && _o !== void 0 ? _o : s) !== null && _p !== void 0 ? _p : false,
        code: o.code ? { ...o.code, optimize, regExp } : { optimize, regExp },
        loopRequired: (_q = o.loopRequired) !== null && _q !== void 0 ? _q : MAX_EXPRESSION,
        loopEnum: (_r = o.loopEnum) !== null && _r !== void 0 ? _r : MAX_EXPRESSION,
        meta: (_s = o.meta) !== null && _s !== void 0 ? _s : true,
        messages: (_t = o.messages) !== null && _t !== void 0 ? _t : true,
        inlineRefs: (_u = o.inlineRefs) !== null && _u !== void 0 ? _u : true,
        schemaId: (_v = o.schemaId) !== null && _v !== void 0 ? _v : "$id",
        addUsedSchema: (_w = o.addUsedSchema) !== null && _w !== void 0 ? _w : true,
        validateSchema: (_x = o.validateSchema) !== null && _x !== void 0 ? _x : true,
        validateFormats: (_y = o.validateFormats) !== null && _y !== void 0 ? _y : true,
        unicodeRegExp: (_z = o.unicodeRegExp) !== null && _z !== void 0 ? _z : true,
        int32range: (_0 = o.int32range) !== null && _0 !== void 0 ? _0 : true,
        uriResolver: uriResolver,
    };
}
class Ajv {
    constructor(opts = {}) {
        this.schemas = {};
        this.refs = {};
        this.formats = {};
        this._compilations = new Set();
        this._loading = {};
        this._cache = new Map();
        opts = this.opts = { ...opts, ...requiredOptions(opts) };
        const { es5, lines } = this.opts.code;
        this.scope = new codegen_2.ValueScope({ scope: {}, prefixes: EXT_SCOPE_NAMES, es5, lines });
        this.logger = getLogger(opts.logger);
        const formatOpt = opts.validateFormats;
        opts.validateFormats = false;
        this.RULES = (0, rules_1.getRules)();
        checkOptions.call(this, removedOptions, opts, "NOT SUPPORTED");
        checkOptions.call(this, deprecatedOptions, opts, "DEPRECATED", "warn");
        this._metaOpts = getMetaSchemaOptions.call(this);
        if (opts.formats)
            addInitialFormats.call(this);
        this._addVocabularies();
        this._addDefaultMetaSchema();
        if (opts.keywords)
            addInitialKeywords.call(this, opts.keywords);
        if (typeof opts.meta == "object")
            this.addMetaSchema(opts.meta);
        addInitialSchemas.call(this);
        opts.validateFormats = formatOpt;
    }
    _addVocabularies() {
        this.addKeyword("$async");
    }
    _addDefaultMetaSchema() {
        const { $data, meta, schemaId } = this.opts;
        let _dataRefSchema = $dataRefSchema;
        if (schemaId === "id") {
            _dataRefSchema = { ...$dataRefSchema };
            _dataRefSchema.id = _dataRefSchema.$id;
            delete _dataRefSchema.$id;
        }
        if (meta && $data)
            this.addMetaSchema(_dataRefSchema, _dataRefSchema[schemaId], false);
    }
    defaultMeta() {
        const { meta, schemaId } = this.opts;
        return (this.opts.defaultMeta = typeof meta == "object" ? meta[schemaId] || meta : undefined);
    }
    validate(schemaKeyRef, // key, ref or schema object
    // eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
    data // to be validated
    ) {
        let v;
        if (typeof schemaKeyRef == "string") {
            v = this.getSchema(schemaKeyRef);
            if (!v)
                throw new Error(`no schema with key or ref "${schemaKeyRef}"`);
        }
        else {
            v = this.compile(schemaKeyRef);
        }
        const valid = v(data);
        if (!("$async" in v))
            this.errors = v.errors;
        return valid;
    }
    compile(schema, _meta) {
        const sch = this._addSchema(schema, _meta);
        return (sch.validate || this._compileSchemaEnv(sch));
    }
    compileAsync(schema, meta) {
        if (typeof this.opts.loadSchema != "function") {
            throw new Error("options.loadSchema should be a function");
        }
        const { loadSchema } = this.opts;
        return runCompileAsync.call(this, schema, meta);
        async function runCompileAsync(_schema, _meta) {
            await loadMetaSchema.call(this, _schema.$schema);
            const sch = this._addSchema(_schema, _meta);
            return sch.validate || _compileAsync.call(this, sch);
        }
        async function loadMetaSchema($ref) {
            if ($ref && !this.getSchema($ref)) {
                await runCompileAsync.call(this, { $ref }, true);
            }
        }
        async function _compileAsync(sch) {
            try {
                return this._compileSchemaEnv(sch);
            }
            catch (e) {
                if (!(e instanceof ref_error_1.default))
                    throw e;
                checkLoaded.call(this, e);
                await loadMissingSchema.call(this, e.missingSchema);
                return _compileAsync.call(this, sch);
            }
        }
        function checkLoaded({ missingSchema: ref, missingRef }) {
            if (this.refs[ref]) {
                throw new Error(`AnySchema ${ref} is loaded but ${missingRef} cannot be resolved`);
            }
        }
        async function loadMissingSchema(ref) {
            const _schema = await _loadSchema.call(this, ref);
            if (!this.refs[ref])
                await loadMetaSchema.call(this, _schema.$schema);
            if (!this.refs[ref])
                this.addSchema(_schema, ref, meta);
        }
        async function _loadSchema(ref) {
            const p = this._loading[ref];
            if (p)
                return p;
            try {
                return await (this._loading[ref] = loadSchema(ref));
            }
            finally {
                delete this._loading[ref];
            }
        }
    }
    // Adds schema to the instance
    addSchema(schema, // If array is passed, `key` will be ignored
    key, // Optional schema key. Can be passed to `validate` method instead of schema object or id/ref. One schema per instance can have empty `id` and `key`.
    _meta, // true if schema is a meta-schema. Used internally, addMetaSchema should be used instead.
    _validateSchema = this.opts.validateSchema // false to skip schema validation. Used internally, option validateSchema should be used instead.
    ) {
        if (Array.isArray(schema)) {
            for (const sch of schema)
                this.addSchema(sch, undefined, _meta, _validateSchema);
            return this;
        }
        let id;
        if (typeof schema === "object") {
            const { schemaId } = this.opts;
            id = schema[schemaId];
            if (id !== undefined && typeof id != "string") {
                throw new Error(`schema ${schemaId} must be string`);
            }
        }
        key = (0, resolve_1.normalizeId)(key || id);
        this._checkUnique(key);
        this.schemas[key] = this._addSchema(schema, _meta, key, _validateSchema, true);
        return this;
    }
    // Add schema that will be used to validate other schemas
    // options in META_IGNORE_OPTIONS are alway set to false
    addMetaSchema(schema, key, // schema key
    _validateSchema = this.opts.validateSchema // false to skip schema validation, can be used to override validateSchema option for meta-schema
    ) {
        this.addSchema(schema, key, true, _validateSchema);
        return this;
    }
    //  Validate schema against its meta-schema
    validateSchema(schema, throwOrLogError) {
        if (typeof schema == "boolean")
            return true;
        let $schema;
        $schema = schema.$schema;
        if ($schema !== undefined && typeof $schema != "string") {
            throw new Error("$schema must be a string");
        }
        $schema = $schema || this.opts.defaultMeta || this.defaultMeta();
        if (!$schema) {
            this.logger.warn("meta-schema not available");
            this.errors = null;
            return true;
        }
        const valid = this.validate($schema, schema);
        if (!valid && throwOrLogError) {
            const message = "schema is invalid: " + this.errorsText();
            if (this.opts.validateSchema === "log")
                this.logger.error(message);
            else
                throw new Error(message);
        }
        return valid;
    }
    // Get compiled schema by `key` or `ref`.
    // (`key` that was passed to `addSchema` or full schema reference - `schema.$id` or resolved id)
    getSchema(keyRef) {
        let sch;
        while (typeof (sch = getSchEnv.call(this, keyRef)) == "string")
            keyRef = sch;
        if (sch === undefined) {
            const { schemaId } = this.opts;
            const root = new compile_1.SchemaEnv({ schema: {}, schemaId });
            sch = compile_1.resolveSchema.call(this, root, keyRef);
            if (!sch)
                return;
            this.refs[keyRef] = sch;
        }
        return (sch.validate || this._compileSchemaEnv(sch));
    }
    // Remove cached schema(s).
    // If no parameter is passed all schemas but meta-schemas are removed.
    // If RegExp is passed all schemas with key/id matching pattern but meta-schemas are removed.
    // Even if schema is referenced by other schemas it still can be removed as other schemas have local references.
    removeSchema(schemaKeyRef) {
        if (schemaKeyRef instanceof RegExp) {
            this._removeAllSchemas(this.schemas, schemaKeyRef);
            this._removeAllSchemas(this.refs, schemaKeyRef);
            return this;
        }
        switch (typeof schemaKeyRef) {
            case "undefined":
                this._removeAllSchemas(this.schemas);
                this._removeAllSchemas(this.refs);
                this._cache.clear();
                return this;
            case "string": {
                const sch = getSchEnv.call(this, schemaKeyRef);
                if (typeof sch == "object")
                    this._cache.delete(sch.schema);
                delete this.schemas[schemaKeyRef];
                delete this.refs[schemaKeyRef];
                return this;
            }
            case "object": {
                const cacheKey = schemaKeyRef;
                this._cache.delete(cacheKey);
                let id = schemaKeyRef[this.opts.schemaId];
                if (id) {
                    id = (0, resolve_1.normalizeId)(id);
                    delete this.schemas[id];
                    delete this.refs[id];
                }
                return this;
            }
            default:
                throw new Error("ajv.removeSchema: invalid parameter");
        }
    }
    // add "vocabulary" - a collection of keywords
    addVocabulary(definitions) {
        for (const def of definitions)
            this.addKeyword(def);
        return this;
    }
    addKeyword(kwdOrDef, def // deprecated
    ) {
        let keyword;
        if (typeof kwdOrDef == "string") {
            keyword = kwdOrDef;
            if (typeof def == "object") {
                this.logger.warn("these parameters are deprecated, see docs for addKeyword");
                def.keyword = keyword;
            }
        }
        else if (typeof kwdOrDef == "object" && def === undefined) {
            def = kwdOrDef;
            keyword = def.keyword;
            if (Array.isArray(keyword) && !keyword.length) {
                throw new Error("addKeywords: keyword must be string or non-empty array");
            }
        }
        else {
            throw new Error("invalid addKeywords parameters");
        }
        checkKeyword.call(this, keyword, def);
        if (!def) {
            (0, util_1.eachItem)(keyword, (kwd) => addRule.call(this, kwd));
            return this;
        }
        keywordMetaschema.call(this, def);
        const definition = {
            ...def,
            type: (0, dataType_1.getJSONTypes)(def.type),
            schemaType: (0, dataType_1.getJSONTypes)(def.schemaType),
        };
        (0, util_1.eachItem)(keyword, definition.type.length === 0
            ? (k) => addRule.call(this, k, definition)
            : (k) => definition.type.forEach((t) => addRule.call(this, k, definition, t)));
        return this;
    }
    getKeyword(keyword) {
        const rule = this.RULES.all[keyword];
        return typeof rule == "object" ? rule.definition : !!rule;
    }
    // Remove keyword
    removeKeyword(keyword) {
        // TODO return type should be Ajv
        const { RULES } = this;
        delete RULES.keywords[keyword];
        delete RULES.all[keyword];
        for (const group of RULES.rules) {
            const i = group.rules.findIndex((rule) => rule.keyword === keyword);
            if (i >= 0)
                group.rules.splice(i, 1);
        }
        return this;
    }
    // Add format
    addFormat(name, format) {
        if (typeof format == "string")
            format = new RegExp(format);
        this.formats[name] = format;
        return this;
    }
    errorsText(errors = this.errors, // optional array of validation errors
    { separator = ", ", dataVar = "data" } = {} // optional options with properties `separator` and `dataVar`
    ) {
        if (!errors || errors.length === 0)
            return "No errors";
        return errors
            .map((e) => `${dataVar}${e.instancePath} ${e.message}`)
            .reduce((text, msg) => text + separator + msg);
    }
    $dataMetaSchema(metaSchema, keywordsJsonPointers) {
        const rules = this.RULES.all;
        metaSchema = JSON.parse(JSON.stringify(metaSchema));
        for (const jsonPointer of keywordsJsonPointers) {
            const segments = jsonPointer.split("/").slice(1); // first segment is an empty string
            let keywords = metaSchema;
            for (const seg of segments)
                keywords = keywords[seg];
            for (const key in rules) {
                const rule = rules[key];
                if (typeof rule != "object")
                    continue;
                const { $data } = rule.definition;
                const schema = keywords[key];
                if ($data && schema)
                    keywords[key] = schemaOrData(schema);
            }
        }
        return metaSchema;
    }
    _removeAllSchemas(schemas, regex) {
        for (const keyRef in schemas) {
            const sch = schemas[keyRef];
            if (!regex || regex.test(keyRef)) {
                if (typeof sch == "string") {
                    delete schemas[keyRef];
                }
                else if (sch && !sch.meta) {
                    this._cache.delete(sch.schema);
                    delete schemas[keyRef];
                }
            }
        }
    }
    _addSchema(schema, meta, baseId, validateSchema = this.opts.validateSchema, addSchema = this.opts.addUsedSchema) {
        let id;
        const { schemaId } = this.opts;
        if (typeof schema == "object") {
            id = schema[schemaId];
        }
        else {
            if (this.opts.jtd)
                throw new Error("schema must be object");
            else if (typeof schema != "boolean")
                throw new Error("schema must be object or boolean");
        }
        let sch = this._cache.get(schema);
        if (sch !== undefined)
            return sch;
        baseId = (0, resolve_1.normalizeId)(id || baseId);
        const localRefs = resolve_1.getSchemaRefs.call(this, schema, baseId);
        sch = new compile_1.SchemaEnv({ schema, schemaId, meta, baseId, localRefs });
        this._cache.set(sch.schema, sch);
        if (addSchema && !baseId.startsWith("#")) {
            // TODO atm it is allowed to overwrite schemas without id (instead of not adding them)
            if (baseId)
                this._checkUnique(baseId);
            this.refs[baseId] = sch;
        }
        if (validateSchema)
            this.validateSchema(schema, true);
        return sch;
    }
    _checkUnique(id) {
        if (this.schemas[id] || this.refs[id]) {
            throw new Error(`schema with key or id "${id}" already exists`);
        }
    }
    _compileSchemaEnv(sch) {
        if (sch.meta)
            this._compileMetaSchema(sch);
        else
            compile_1.compileSchema.call(this, sch);
        /* istanbul ignore if */
        if (!sch.validate)
            throw new Error("ajv implementation error");
        return sch.validate;
    }
    _compileMetaSchema(sch) {
        const currentOpts = this.opts;
        this.opts = this._metaOpts;
        try {
            compile_1.compileSchema.call(this, sch);
        }
        finally {
            this.opts = currentOpts;
        }
    }
}
Ajv.ValidationError = validation_error_1.default;
Ajv.MissingRefError = ref_error_1.default;
exports["default"] = Ajv;
function checkOptions(checkOpts, options, msg, log = "error") {
    for (const key in checkOpts) {
        const opt = key;
        if (opt in options)
            this.logger[log](`${msg}: option ${key}. ${checkOpts[opt]}`);
    }
}
function getSchEnv(keyRef) {
    keyRef = (0, resolve_1.normalizeId)(keyRef); // TODO tests fail without this line
    return this.schemas[keyRef] || this.refs[keyRef];
}
function addInitialSchemas() {
    const optsSchemas = this.opts.schemas;
    if (!optsSchemas)
        return;
    if (Array.isArray(optsSchemas))
        this.addSchema(optsSchemas);
    else
        for (const key in optsSchemas)
            this.addSchema(optsSchemas[key], key);
}
function addInitialFormats() {
    for (const name in this.opts.formats) {
        const format = this.opts.formats[name];
        if (format)
            this.addFormat(name, format);
    }
}
function addInitialKeywords(defs) {
    if (Array.isArray(defs)) {
        this.addVocabulary(defs);
        return;
    }
    this.logger.warn("keywords option as map is deprecated, pass array");
    for (const keyword in defs) {
        const def = defs[keyword];
        if (!def.keyword)
            def.keyword = keyword;
        this.addKeyword(def);
    }
}
function getMetaSchemaOptions() {
    const metaOpts = { ...this.opts };
    for (const opt of META_IGNORE_OPTIONS)
        delete metaOpts[opt];
    return metaOpts;
}
const noLogs = { log() { }, warn() { }, error() { } };
function getLogger(logger) {
    if (logger === false)
        return noLogs;
    if (logger === undefined)
        return console;
    if (logger.log && logger.warn && logger.error)
        return logger;
    throw new Error("logger must implement log, warn and error methods");
}
const KEYWORD_NAME = /^[a-z_$][a-z0-9_$:-]*$/i;
function checkKeyword(keyword, def) {
    const { RULES } = this;
    (0, util_1.eachItem)(keyword, (kwd) => {
        if (RULES.keywords[kwd])
            throw new Error(`Keyword ${kwd} is already defined`);
        if (!KEYWORD_NAME.test(kwd))
            throw new Error(`Keyword ${kwd} has invalid name`);
    });
    if (!def)
        return;
    if (def.$data && !("code" in def || "validate" in def)) {
        throw new Error('$data keyword must have "code" or "validate" function');
    }
}
function addRule(keyword, definition, dataType) {
    var _a;
    const post = definition === null || definition === void 0 ? void 0 : definition.post;
    if (dataType && post)
        throw new Error('keyword with "post" flag cannot have "type"');
    const { RULES } = this;
    let ruleGroup = post ? RULES.post : RULES.rules.find(({ type: t }) => t === dataType);
    if (!ruleGroup) {
        ruleGroup = { type: dataType, rules: [] };
        RULES.rules.push(ruleGroup);
    }
    RULES.keywords[keyword] = true;
    if (!definition)
        return;
    const rule = {
        keyword,
        definition: {
            ...definition,
            type: (0, dataType_1.getJSONTypes)(definition.type),
            schemaType: (0, dataType_1.getJSONTypes)(definition.schemaType),
        },
    };
    if (definition.before)
        addBeforeRule.call(this, ruleGroup, rule, definition.before);
    else
        ruleGroup.rules.push(rule);
    RULES.all[keyword] = rule;
    (_a = definition.implements) === null || _a === void 0 ? void 0 : _a.forEach((kwd) => this.addKeyword(kwd));
}
function addBeforeRule(ruleGroup, rule, before) {
    const i = ruleGroup.rules.findIndex((_rule) => _rule.keyword === before);
    if (i >= 0) {
        ruleGroup.rules.splice(i, 0, rule);
    }
    else {
        ruleGroup.rules.push(rule);
        this.logger.warn(`rule ${before} is not defined`);
    }
}
function keywordMetaschema(def) {
    let { metaSchema } = def;
    if (metaSchema === undefined)
        return;
    if (def.$data && this.opts.$data)
        metaSchema = schemaOrData(metaSchema);
    def.validateSchema = this.compile(metaSchema, true);
}
const $dataRef = {
    $ref: "https://raw.githubusercontent.com/ajv-validator/ajv/master/lib/refs/data.json#",
};
function schemaOrData(schema) {
    return { anyOf: [schema, $dataRef] };
}
//# sourceMappingURL=core.js.map

},
18154(__unused_rspack_module, exports, __webpack_require__) {
var __webpack_unused_export__;

__webpack_unused_export__ = ({ value: true });
// https://github.com/ajv-validator/ajv/issues/889
const equal = __webpack_require__(88992);
equal.code = 'require("ajv/dist/runtime/equal").default';
exports["default"] = equal;
//# sourceMappingURL=equal.js.map

},
45325(__unused_rspack_module, exports) {
var __webpack_unused_export__;

__webpack_unused_export__ = ({ value: true });
// https://mathiasbynens.be/notes/javascript-encoding
// https://github.com/bestiejs/punycode.js - punycode.ucs2.decode
function ucs2length(str) {
    const len = str.length;
    let length = 0;
    let pos = 0;
    let value;
    while (pos < len) {
        length++;
        value = str.charCodeAt(pos++);
        if (value >= 0xd800 && value <= 0xdbff && pos < len) {
            // high surrogate, and there is a next character
            value = str.charCodeAt(pos);
            if ((value & 0xfc00) === 0xdc00)
                pos++; // low surrogate
        }
    }
    return length;
}
exports["default"] = ucs2length;
ucs2length.code = 'require("ajv/dist/runtime/ucs2length").default';
//# sourceMappingURL=ucs2length.js.map

},
36024(__unused_rspack_module, exports, __webpack_require__) {
var __webpack_unused_export__;

__webpack_unused_export__ = ({ value: true });
const uri = __webpack_require__(87052);
uri.code = 'require("ajv/dist/runtime/uri").default';
exports["default"] = uri;
//# sourceMappingURL=uri.js.map

},
9894(__unused_rspack_module, exports) {

Object.defineProperty(exports, "__esModule", ({ value: true }));
class ValidationError extends Error {
    constructor(errors) {
        super("validation failed");
        this.errors = errors;
        this.ajv = this.validation = true;
    }
}
exports["default"] = ValidationError;
//# sourceMappingURL=validation_error.js.map

},
86449(__unused_rspack_module, exports, __webpack_require__) {
var __webpack_unused_export__;

__webpack_unused_export__ = ({ value: true });
exports.validateAdditionalItems = void 0;
const codegen_1 = __webpack_require__(48325);
const util_1 = __webpack_require__(53571);
const error = {
    message: ({ params: { len } }) => (0, codegen_1.str) `must NOT have more than ${len} items`,
    params: ({ params: { len } }) => (0, codegen_1._) `{limit: ${len}}`,
};
const def = {
    keyword: "additionalItems",
    type: "array",
    schemaType: ["boolean", "object"],
    before: "uniqueItems",
    error,
    code(cxt) {
        const { parentSchema, it } = cxt;
        const { items } = parentSchema;
        if (!Array.isArray(items)) {
            (0, util_1.checkStrictMode)(it, '"additionalItems" is ignored when "items" is not an array of schemas');
            return;
        }
        validateAdditionalItems(cxt, items);
    },
};
function validateAdditionalItems(cxt, items) {
    const { gen, schema, data, keyword, it } = cxt;
    it.items = true;
    const len = gen.const("len", (0, codegen_1._) `${data}.length`);
    if (schema === false) {
        cxt.setParams({ len: items.length });
        cxt.pass((0, codegen_1._) `${len} <= ${items.length}`);
    }
    else if (typeof schema == "object" && !(0, util_1.alwaysValidSchema)(it, schema)) {
        const valid = gen.var("valid", (0, codegen_1._) `${len} <= ${items.length}`); // TODO var
        gen.if((0, codegen_1.not)(valid), () => validateItems(valid));
        cxt.ok(valid);
    }
    function validateItems(valid) {
        gen.forRange("i", items.length, len, (i) => {
            cxt.subschema({ keyword, dataProp: i, dataPropType: util_1.Type.Num }, valid);
            if (!it.allErrors)
                gen.if((0, codegen_1.not)(valid), () => gen.break());
        });
    }
}
exports.validateAdditionalItems = validateAdditionalItems;
exports["default"] = def;
//# sourceMappingURL=additionalItems.js.map

},
89108(__unused_rspack_module, exports, __webpack_require__) {
var __webpack_unused_export__;

__webpack_unused_export__ = ({ value: true });
const code_1 = __webpack_require__(3493);
const codegen_1 = __webpack_require__(48325);
const names_1 = __webpack_require__(28727);
const util_1 = __webpack_require__(53571);
const error = {
    message: "must NOT have additional properties",
    params: ({ params }) => (0, codegen_1._) `{additionalProperty: ${params.additionalProperty}}`,
};
const def = {
    keyword: "additionalProperties",
    type: ["object"],
    schemaType: ["boolean", "object"],
    allowUndefined: true,
    trackErrors: true,
    error,
    code(cxt) {
        const { gen, schema, parentSchema, data, errsCount, it } = cxt;
        /* istanbul ignore if */
        if (!errsCount)
            throw new Error("ajv implementation error");
        const { allErrors, opts } = it;
        it.props = true;
        if (opts.removeAdditional !== "all" && (0, util_1.alwaysValidSchema)(it, schema))
            return;
        const props = (0, code_1.allSchemaProperties)(parentSchema.properties);
        const patProps = (0, code_1.allSchemaProperties)(parentSchema.patternProperties);
        checkAdditionalProperties();
        cxt.ok((0, codegen_1._) `${errsCount} === ${names_1.default.errors}`);
        function checkAdditionalProperties() {
            gen.forIn("key", data, (key) => {
                if (!props.length && !patProps.length)
                    additionalPropertyCode(key);
                else
                    gen.if(isAdditional(key), () => additionalPropertyCode(key));
            });
        }
        function isAdditional(key) {
            let definedProp;
            if (props.length > 8) {
                // TODO maybe an option instead of hard-coded 8?
                const propsSchema = (0, util_1.schemaRefOrVal)(it, parentSchema.properties, "properties");
                definedProp = (0, code_1.isOwnProperty)(gen, propsSchema, key);
            }
            else if (props.length) {
                definedProp = (0, codegen_1.or)(...props.map((p) => (0, codegen_1._) `${key} === ${p}`));
            }
            else {
                definedProp = codegen_1.nil;
            }
            if (patProps.length) {
                definedProp = (0, codegen_1.or)(definedProp, ...patProps.map((p) => (0, codegen_1._) `${(0, code_1.usePattern)(cxt, p)}.test(${key})`));
            }
            return (0, codegen_1.not)(definedProp);
        }
        function deleteAdditional(key) {
            gen.code((0, codegen_1._) `delete ${data}[${key}]`);
        }
        function additionalPropertyCode(key) {
            if (opts.removeAdditional === "all" || (opts.removeAdditional && schema === false)) {
                deleteAdditional(key);
                return;
            }
            if (schema === false) {
                cxt.setParams({ additionalProperty: key });
                cxt.error();
                if (!allErrors)
                    gen.break();
                return;
            }
            if (typeof schema == "object" && !(0, util_1.alwaysValidSchema)(it, schema)) {
                const valid = gen.name("valid");
                if (opts.removeAdditional === "failing") {
                    applyAdditionalSchema(key, valid, false);
                    gen.if((0, codegen_1.not)(valid), () => {
                        cxt.reset();
                        deleteAdditional(key);
                    });
                }
                else {
                    applyAdditionalSchema(key, valid);
                    if (!allErrors)
                        gen.if((0, codegen_1.not)(valid), () => gen.break());
                }
            }
        }
        function applyAdditionalSchema(key, valid, errors) {
            const subschema = {
                keyword: "additionalProperties",
                dataProp: key,
                dataPropType: util_1.Type.Str,
            };
            if (errors === false) {
                Object.assign(subschema, {
                    compositeRule: true,
                    createErrors: false,
                    allErrors: false,
                });
            }
            cxt.subschema(subschema, valid);
        }
    },
};
exports["default"] = def;
//# sourceMappingURL=additionalProperties.js.map

},
51700(__unused_rspack_module, exports, __webpack_require__) {
var __webpack_unused_export__;

__webpack_unused_export__ = ({ value: true });
const util_1 = __webpack_require__(53571);
const def = {
    keyword: "allOf",
    schemaType: "array",
    code(cxt) {
        const { gen, schema, it } = cxt;
        /* istanbul ignore if */
        if (!Array.isArray(schema))
            throw new Error("ajv implementation error");
        const valid = gen.name("valid");
        schema.forEach((sch, i) => {
            if ((0, util_1.alwaysValidSchema)(it, sch))
                return;
            const schCxt = cxt.subschema({ keyword: "allOf", schemaProp: i }, valid);
            cxt.ok(valid);
            cxt.mergeEvaluated(schCxt);
        });
    },
};
exports["default"] = def;
//# sourceMappingURL=allOf.js.map

},
65097(__unused_rspack_module, exports, __webpack_require__) {
var __webpack_unused_export__;

__webpack_unused_export__ = ({ value: true });
const code_1 = __webpack_require__(3493);
const def = {
    keyword: "anyOf",
    schemaType: "array",
    trackErrors: true,
    code: code_1.validateUnion,
    error: { message: "must match a schema in anyOf" },
};
exports["default"] = def;
//# sourceMappingURL=anyOf.js.map

},
6373(__unused_rspack_module, exports, __webpack_require__) {
var __webpack_unused_export__;

__webpack_unused_export__ = ({ value: true });
const codegen_1 = __webpack_require__(48325);
const util_1 = __webpack_require__(53571);
const error = {
    message: ({ params: { min, max } }) => max === undefined
        ? (0, codegen_1.str) `must contain at least ${min} valid item(s)`
        : (0, codegen_1.str) `must contain at least ${min} and no more than ${max} valid item(s)`,
    params: ({ params: { min, max } }) => max === undefined ? (0, codegen_1._) `{minContains: ${min}}` : (0, codegen_1._) `{minContains: ${min}, maxContains: ${max}}`,
};
const def = {
    keyword: "contains",
    type: "array",
    schemaType: ["object", "boolean"],
    before: "uniqueItems",
    trackErrors: true,
    error,
    code(cxt) {
        const { gen, schema, parentSchema, data, it } = cxt;
        let min;
        let max;
        const { minContains, maxContains } = parentSchema;
        if (it.opts.next) {
            min = minContains === undefined ? 1 : minContains;
            max = maxContains;
        }
        else {
            min = 1;
        }
        const len = gen.const("len", (0, codegen_1._) `${data}.length`);
        cxt.setParams({ min, max });
        if (max === undefined && min === 0) {
            (0, util_1.checkStrictMode)(it, `"minContains" == 0 without "maxContains": "contains" keyword ignored`);
            return;
        }
        if (max !== undefined && min > max) {
            (0, util_1.checkStrictMode)(it, `"minContains" > "maxContains" is always invalid`);
            cxt.fail();
            return;
        }
        if ((0, util_1.alwaysValidSchema)(it, schema)) {
            let cond = (0, codegen_1._) `${len} >= ${min}`;
            if (max !== undefined)
                cond = (0, codegen_1._) `${cond} && ${len} <= ${max}`;
            cxt.pass(cond);
            return;
        }
        it.items = true;
        const valid = gen.name("valid");
        if (max === undefined && min === 1) {
            validateItems(valid, () => gen.if(valid, () => gen.break()));
        }
        else if (min === 0) {
            gen.let(valid, true);
            if (max !== undefined)
                gen.if((0, codegen_1._) `${data}.length > 0`, validateItemsWithCount);
        }
        else {
            gen.let(valid, false);
            validateItemsWithCount();
        }
        cxt.result(valid, () => cxt.reset());
        function validateItemsWithCount() {
            const schValid = gen.name("_valid");
            const count = gen.let("count", 0);
            validateItems(schValid, () => gen.if(schValid, () => checkLimits(count)));
        }
        function validateItems(_valid, block) {
            gen.forRange("i", 0, len, (i) => {
                cxt.subschema({
                    keyword: "contains",
                    dataProp: i,
                    dataPropType: util_1.Type.Num,
                    compositeRule: true,
                }, _valid);
                block();
            });
        }
        function checkLimits(count) {
            gen.code((0, codegen_1._) `${count}++`);
            if (max === undefined) {
                gen.if((0, codegen_1._) `${count} >= ${min}`, () => gen.assign(valid, true).break());
            }
            else {
                gen.if((0, codegen_1._) `${count} > ${max}`, () => gen.assign(valid, false).break());
                if (min === 1)
                    gen.assign(valid, true);
                else
                    gen.if((0, codegen_1._) `${count} >= ${min}`, () => gen.assign(valid, true));
            }
        }
    },
};
exports["default"] = def;
//# sourceMappingURL=contains.js.map

},
40961(__unused_rspack_module, exports, __webpack_require__) {
var __webpack_unused_export__;

__webpack_unused_export__ = ({ value: true });
__webpack_unused_export__ = __webpack_unused_export__ = exports.z3 = void 0;
const codegen_1 = __webpack_require__(48325);
const util_1 = __webpack_require__(53571);
const code_1 = __webpack_require__(3493);
exports.z3 = {
    message: ({ params: { property, depsCount, deps } }) => {
        const property_ies = depsCount === 1 ? "property" : "properties";
        return (0, codegen_1.str) `must have ${property_ies} ${deps} when property ${property} is present`;
    },
    params: ({ params: { property, depsCount, deps, missingProperty } }) => (0, codegen_1._) `{property: ${property},
    missingProperty: ${missingProperty},
    depsCount: ${depsCount},
    deps: ${deps}}`, // TODO change to reference
};
const def = {
    keyword: "dependencies",
    type: "object",
    schemaType: "object",
    error: exports.z3,
    code(cxt) {
        const [propDeps, schDeps] = splitDependencies(cxt);
        validatePropertyDeps(cxt, propDeps);
        validateSchemaDeps(cxt, schDeps);
    },
};
function splitDependencies({ schema }) {
    const propertyDeps = {};
    const schemaDeps = {};
    for (const key in schema) {
        if (key === "__proto__")
            continue;
        const deps = Array.isArray(schema[key]) ? propertyDeps : schemaDeps;
        deps[key] = schema[key];
    }
    return [propertyDeps, schemaDeps];
}
function validatePropertyDeps(cxt, propertyDeps = cxt.schema) {
    const { gen, data, it } = cxt;
    if (Object.keys(propertyDeps).length === 0)
        return;
    const missing = gen.let("missing");
    for (const prop in propertyDeps) {
        const deps = propertyDeps[prop];
        if (deps.length === 0)
            continue;
        const hasProperty = (0, code_1.propertyInData)(gen, data, prop, it.opts.ownProperties);
        cxt.setParams({
            property: prop,
            depsCount: deps.length,
            deps: deps.join(", "),
        });
        if (it.allErrors) {
            gen.if(hasProperty, () => {
                for (const depProp of deps) {
                    (0, code_1.checkReportMissingProp)(cxt, depProp);
                }
            });
        }
        else {
            gen.if((0, codegen_1._) `${hasProperty} && (${(0, code_1.checkMissingProp)(cxt, deps, missing)})`);
            (0, code_1.reportMissingProp)(cxt, missing);
            gen.else();
        }
    }
}
__webpack_unused_export__ = validatePropertyDeps;
function validateSchemaDeps(cxt, schemaDeps = cxt.schema) {
    const { gen, data, keyword, it } = cxt;
    const valid = gen.name("valid");
    for (const prop in schemaDeps) {
        if ((0, util_1.alwaysValidSchema)(it, schemaDeps[prop]))
            continue;
        gen.if((0, code_1.propertyInData)(gen, data, prop, it.opts.ownProperties), () => {
            const schCxt = cxt.subschema({ keyword, schemaProp: prop }, valid);
            cxt.mergeValidEvaluated(schCxt, valid);
        }, () => gen.var(valid, true) // TODO var
        );
        cxt.ok(valid);
    }
}
__webpack_unused_export__ = validateSchemaDeps;
exports["default"] = def;
//# sourceMappingURL=dependencies.js.map

},
67975(__unused_rspack_module, exports, __webpack_require__) {
var __webpack_unused_export__;

__webpack_unused_export__ = ({ value: true });
const codegen_1 = __webpack_require__(48325);
const util_1 = __webpack_require__(53571);
const error = {
    message: ({ params }) => (0, codegen_1.str) `must match "${params.ifClause}" schema`,
    params: ({ params }) => (0, codegen_1._) `{failingKeyword: ${params.ifClause}}`,
};
const def = {
    keyword: "if",
    schemaType: ["object", "boolean"],
    trackErrors: true,
    error,
    code(cxt) {
        const { gen, parentSchema, it } = cxt;
        if (parentSchema.then === undefined && parentSchema.else === undefined) {
            (0, util_1.checkStrictMode)(it, '"if" without "then" and "else" is ignored');
        }
        const hasThen = hasSchema(it, "then");
        const hasElse = hasSchema(it, "else");
        if (!hasThen && !hasElse)
            return;
        const valid = gen.let("valid", true);
        const schValid = gen.name("_valid");
        validateIf();
        cxt.reset();
        if (hasThen && hasElse) {
            const ifClause = gen.let("ifClause");
            cxt.setParams({ ifClause });
            gen.if(schValid, validateClause("then", ifClause), validateClause("else", ifClause));
        }
        else if (hasThen) {
            gen.if(schValid, validateClause("then"));
        }
        else {
            gen.if((0, codegen_1.not)(schValid), validateClause("else"));
        }
        cxt.pass(valid, () => cxt.error(true));
        function validateIf() {
            const schCxt = cxt.subschema({
                keyword: "if",
                compositeRule: true,
                createErrors: false,
                allErrors: false,
            }, schValid);
            cxt.mergeEvaluated(schCxt);
        }
        function validateClause(keyword, ifClause) {
            return () => {
                const schCxt = cxt.subschema({ keyword }, schValid);
                gen.assign(valid, schValid);
                cxt.mergeValidEvaluated(schCxt, valid);
                if (ifClause)
                    gen.assign(ifClause, (0, codegen_1._) `${keyword}`);
                else
                    cxt.setParams({ ifClause: keyword });
            };
        }
    },
};
function hasSchema(it, keyword) {
    const schema = it.schema[keyword];
    return schema !== undefined && !(0, util_1.alwaysValidSchema)(it, schema);
}
exports["default"] = def;
//# sourceMappingURL=if.js.map

},
73546(__unused_rspack_module, exports, __webpack_require__) {
var __webpack_unused_export__;

__webpack_unused_export__ = ({ value: true });
const additionalItems_1 = __webpack_require__(86449);
const prefixItems_1 = __webpack_require__(13338);
const items_1 = __webpack_require__(89566);
const items2020_1 = __webpack_require__(51774);
const contains_1 = __webpack_require__(6373);
const dependencies_1 = __webpack_require__(40961);
const propertyNames_1 = __webpack_require__(12497);
const additionalProperties_1 = __webpack_require__(89108);
const properties_1 = __webpack_require__(70949);
const patternProperties_1 = __webpack_require__(83013);
const not_1 = __webpack_require__(20883);
const anyOf_1 = __webpack_require__(65097);
const oneOf_1 = __webpack_require__(19859);
const allOf_1 = __webpack_require__(51700);
const if_1 = __webpack_require__(67975);
const thenElse_1 = __webpack_require__(50186);
function getApplicator(draft2020 = false) {
    const applicator = [
        // any
        not_1.default,
        anyOf_1.default,
        oneOf_1.default,
        allOf_1.default,
        if_1.default,
        thenElse_1.default,
        // object
        propertyNames_1.default,
        additionalProperties_1.default,
        dependencies_1.default,
        properties_1.default,
        patternProperties_1.default,
    ];
    // array
    if (draft2020)
        applicator.push(prefixItems_1.default, items2020_1.default);
    else
        applicator.push(additionalItems_1.default, items_1.default);
    applicator.push(contains_1.default);
    return applicator;
}
exports["default"] = getApplicator;
//# sourceMappingURL=index.js.map

},
89566(__unused_rspack_module, exports, __webpack_require__) {
var __webpack_unused_export__;

__webpack_unused_export__ = ({ value: true });
exports.validateTuple = void 0;
const codegen_1 = __webpack_require__(48325);
const util_1 = __webpack_require__(53571);
const code_1 = __webpack_require__(3493);
const def = {
    keyword: "items",
    type: "array",
    schemaType: ["object", "array", "boolean"],
    before: "uniqueItems",
    code(cxt) {
        const { schema, it } = cxt;
        if (Array.isArray(schema))
            return validateTuple(cxt, "additionalItems", schema);
        it.items = true;
        if ((0, util_1.alwaysValidSchema)(it, schema))
            return;
        cxt.ok((0, code_1.validateArray)(cxt));
    },
};
function validateTuple(cxt, extraItems, schArr = cxt.schema) {
    const { gen, parentSchema, data, keyword, it } = cxt;
    checkStrictTuple(parentSchema);
    if (it.opts.unevaluated && schArr.length && it.items !== true) {
        it.items = util_1.mergeEvaluated.items(gen, schArr.length, it.items);
    }
    const valid = gen.name("valid");
    const len = gen.const("len", (0, codegen_1._) `${data}.length`);
    schArr.forEach((sch, i) => {
        if ((0, util_1.alwaysValidSchema)(it, sch))
            return;
        gen.if((0, codegen_1._) `${len} > ${i}`, () => cxt.subschema({
            keyword,
            schemaProp: i,
            dataProp: i,
        }, valid));
        cxt.ok(valid);
    });
    function checkStrictTuple(sch) {
        const { opts, errSchemaPath } = it;
        const l = schArr.length;
        const fullTuple = l === sch.minItems && (l === sch.maxItems || sch[extraItems] === false);
        if (opts.strictTuples && !fullTuple) {
            const msg = `"${keyword}" is ${l}-tuple, but minItems or maxItems/${extraItems} are not specified or different at path "${errSchemaPath}"`;
            (0, util_1.checkStrictMode)(it, msg, opts.strictTuples);
        }
    }
}
exports.validateTuple = validateTuple;
exports["default"] = def;
//# sourceMappingURL=items.js.map

},
51774(__unused_rspack_module, exports, __webpack_require__) {
var __webpack_unused_export__;

__webpack_unused_export__ = ({ value: true });
const codegen_1 = __webpack_require__(48325);
const util_1 = __webpack_require__(53571);
const code_1 = __webpack_require__(3493);
const additionalItems_1 = __webpack_require__(86449);
const error = {
    message: ({ params: { len } }) => (0, codegen_1.str) `must NOT have more than ${len} items`,
    params: ({ params: { len } }) => (0, codegen_1._) `{limit: ${len}}`,
};
const def = {
    keyword: "items",
    type: "array",
    schemaType: ["object", "boolean"],
    before: "uniqueItems",
    error,
    code(cxt) {
        const { schema, parentSchema, it } = cxt;
        const { prefixItems } = parentSchema;
        it.items = true;
        if ((0, util_1.alwaysValidSchema)(it, schema))
            return;
        if (prefixItems)
            (0, additionalItems_1.validateAdditionalItems)(cxt, prefixItems);
        else
            cxt.ok((0, code_1.validateArray)(cxt));
    },
};
exports["default"] = def;
//# sourceMappingURL=items2020.js.map

},
20883(__unused_rspack_module, exports, __webpack_require__) {
var __webpack_unused_export__;

__webpack_unused_export__ = ({ value: true });
const util_1 = __webpack_require__(53571);
const def = {
    keyword: "not",
    schemaType: ["object", "boolean"],
    trackErrors: true,
    code(cxt) {
        const { gen, schema, it } = cxt;
        if ((0, util_1.alwaysValidSchema)(it, schema)) {
            cxt.fail();
            return;
        }
        const valid = gen.name("valid");
        cxt.subschema({
            keyword: "not",
            compositeRule: true,
            createErrors: false,
            allErrors: false,
        }, valid);
        cxt.failResult(valid, () => cxt.reset(), () => cxt.error());
    },
    error: { message: "must NOT be valid" },
};
exports["default"] = def;
//# sourceMappingURL=not.js.map

},
19859(__unused_rspack_module, exports, __webpack_require__) {
var __webpack_unused_export__;

__webpack_unused_export__ = ({ value: true });
const codegen_1 = __webpack_require__(48325);
const util_1 = __webpack_require__(53571);
const error = {
    message: "must match exactly one schema in oneOf",
    params: ({ params }) => (0, codegen_1._) `{passingSchemas: ${params.passing}}`,
};
const def = {
    keyword: "oneOf",
    schemaType: "array",
    trackErrors: true,
    error,
    code(cxt) {
        const { gen, schema, parentSchema, it } = cxt;
        /* istanbul ignore if */
        if (!Array.isArray(schema))
            throw new Error("ajv implementation error");
        if (it.opts.discriminator && parentSchema.discriminator)
            return;
        const schArr = schema;
        const valid = gen.let("valid", false);
        const passing = gen.let("passing", null);
        const schValid = gen.name("_valid");
        cxt.setParams({ passing });
        // TODO possibly fail straight away (with warning or exception) if there are two empty always valid schemas
        gen.block(validateOneOf);
        cxt.result(valid, () => cxt.reset(), () => cxt.error(true));
        function validateOneOf() {
            schArr.forEach((sch, i) => {
                let schCxt;
                if ((0, util_1.alwaysValidSchema)(it, sch)) {
                    gen.var(schValid, true);
                }
                else {
                    schCxt = cxt.subschema({
                        keyword: "oneOf",
                        schemaProp: i,
                        compositeRule: true,
                    }, schValid);
                }
                if (i > 0) {
                    gen
                        .if((0, codegen_1._) `${schValid} && ${valid}`)
                        .assign(valid, false)
                        .assign(passing, (0, codegen_1._) `[${passing}, ${i}]`)
                        .else();
                }
                gen.if(schValid, () => {
                    gen.assign(valid, true);
                    gen.assign(passing, i);
                    if (schCxt)
                        cxt.mergeEvaluated(schCxt, codegen_1.Name);
                });
            });
        }
    },
};
exports["default"] = def;
//# sourceMappingURL=oneOf.js.map

},
83013(__unused_rspack_module, exports, __webpack_require__) {
var __webpack_unused_export__;

__webpack_unused_export__ = ({ value: true });
const code_1 = __webpack_require__(3493);
const codegen_1 = __webpack_require__(48325);
const util_1 = __webpack_require__(53571);
const util_2 = __webpack_require__(53571);
const def = {
    keyword: "patternProperties",
    type: "object",
    schemaType: "object",
    code(cxt) {
        const { gen, schema, data, parentSchema, it } = cxt;
        const { opts } = it;
        const patterns = (0, code_1.allSchemaProperties)(schema);
        const alwaysValidPatterns = patterns.filter((p) => (0, util_1.alwaysValidSchema)(it, schema[p]));
        if (patterns.length === 0 ||
            (alwaysValidPatterns.length === patterns.length &&
                (!it.opts.unevaluated || it.props === true))) {
            return;
        }
        const checkProperties = opts.strictSchema && !opts.allowMatchingProperties && parentSchema.properties;
        const valid = gen.name("valid");
        if (it.props !== true && !(it.props instanceof codegen_1.Name)) {
            it.props = (0, util_2.evaluatedPropsToName)(gen, it.props);
        }
        const { props } = it;
        validatePatternProperties();
        function validatePatternProperties() {
            for (const pat of patterns) {
                if (checkProperties)
                    checkMatchingProperties(pat);
                if (it.allErrors) {
                    validateProperties(pat);
                }
                else {
                    gen.var(valid, true); // TODO var
                    validateProperties(pat);
                    gen.if(valid);
                }
            }
        }
        function checkMatchingProperties(pat) {
            for (const prop in checkProperties) {
                if (new RegExp(pat).test(prop)) {
                    (0, util_1.checkStrictMode)(it, `property ${prop} matches pattern ${pat} (use allowMatchingProperties)`);
                }
            }
        }
        function validateProperties(pat) {
            gen.forIn("key", data, (key) => {
                gen.if((0, codegen_1._) `${(0, code_1.usePattern)(cxt, pat)}.test(${key})`, () => {
                    const alwaysValid = alwaysValidPatterns.includes(pat);
                    if (!alwaysValid) {
                        cxt.subschema({
                            keyword: "patternProperties",
                            schemaProp: pat,
                            dataProp: key,
                            dataPropType: util_2.Type.Str,
                        }, valid);
                    }
                    if (it.opts.unevaluated && props !== true) {
                        gen.assign((0, codegen_1._) `${props}[${key}]`, true);
                    }
                    else if (!alwaysValid && !it.allErrors) {
                        // can short-circuit if `unevaluatedProperties` is not supported (opts.next === false)
                        // or if all properties were evaluated (props === true)
                        gen.if((0, codegen_1.not)(valid), () => gen.break());
                    }
                });
            });
        }
    },
};
exports["default"] = def;
//# sourceMappingURL=patternProperties.js.map

},
13338(__unused_rspack_module, exports, __webpack_require__) {
var __webpack_unused_export__;

__webpack_unused_export__ = ({ value: true });
const items_1 = __webpack_require__(89566);
const def = {
    keyword: "prefixItems",
    type: "array",
    schemaType: ["array"],
    before: "uniqueItems",
    code: (cxt) => (0, items_1.validateTuple)(cxt, "items"),
};
exports["default"] = def;
//# sourceMappingURL=prefixItems.js.map

},
70949(__unused_rspack_module, exports, __webpack_require__) {
var __webpack_unused_export__;

__webpack_unused_export__ = ({ value: true });
const validate_1 = __webpack_require__(42890);
const code_1 = __webpack_require__(3493);
const util_1 = __webpack_require__(53571);
const additionalProperties_1 = __webpack_require__(89108);
const def = {
    keyword: "properties",
    type: "object",
    schemaType: "object",
    code(cxt) {
        const { gen, schema, parentSchema, data, it } = cxt;
        if (it.opts.removeAdditional === "all" && parentSchema.additionalProperties === undefined) {
            additionalProperties_1.default.code(new validate_1.KeywordCxt(it, additionalProperties_1.default, "additionalProperties"));
        }
        const allProps = (0, code_1.allSchemaProperties)(schema);
        for (const prop of allProps) {
            it.definedProperties.add(prop);
        }
        if (it.opts.unevaluated && allProps.length && it.props !== true) {
            it.props = util_1.mergeEvaluated.props(gen, (0, util_1.toHash)(allProps), it.props);
        }
        const properties = allProps.filter((p) => !(0, util_1.alwaysValidSchema)(it, schema[p]));
        if (properties.length === 0)
            return;
        const valid = gen.name("valid");
        for (const prop of properties) {
            if (hasDefault(prop)) {
                applyPropertySchema(prop);
            }
            else {
                gen.if((0, code_1.propertyInData)(gen, data, prop, it.opts.ownProperties));
                applyPropertySchema(prop);
                if (!it.allErrors)
                    gen.else().var(valid, true);
                gen.endIf();
            }
            cxt.it.definedProperties.add(prop);
            cxt.ok(valid);
        }
        function hasDefault(prop) {
            return it.opts.useDefaults && !it.compositeRule && schema[prop].default !== undefined;
        }
        function applyPropertySchema(prop) {
            cxt.subschema({
                keyword: "properties",
                schemaProp: prop,
                dataProp: prop,
            }, valid);
        }
    },
};
exports["default"] = def;
//# sourceMappingURL=properties.js.map

},
12497(__unused_rspack_module, exports, __webpack_require__) {
var __webpack_unused_export__;

__webpack_unused_export__ = ({ value: true });
const codegen_1 = __webpack_require__(48325);
const util_1 = __webpack_require__(53571);
const error = {
    message: "property name must be valid",
    params: ({ params }) => (0, codegen_1._) `{propertyName: ${params.propertyName}}`,
};
const def = {
    keyword: "propertyNames",
    type: "object",
    schemaType: ["object", "boolean"],
    error,
    code(cxt) {
        const { gen, schema, data, it } = cxt;
        if ((0, util_1.alwaysValidSchema)(it, schema))
            return;
        const valid = gen.name("valid");
        gen.forIn("key", data, (key) => {
            cxt.setParams({ propertyName: key });
            cxt.subschema({
                keyword: "propertyNames",
                data: key,
                dataTypes: ["string"],
                propertyName: key,
                compositeRule: true,
            }, valid);
            gen.if((0, codegen_1.not)(valid), () => {
                cxt.error(true);
                if (!it.allErrors)
                    gen.break();
            });
        });
        cxt.ok(valid);
    },
};
exports["default"] = def;
//# sourceMappingURL=propertyNames.js.map

},
50186(__unused_rspack_module, exports, __webpack_require__) {
var __webpack_unused_export__;

__webpack_unused_export__ = ({ value: true });
const util_1 = __webpack_require__(53571);
const def = {
    keyword: ["then", "else"],
    schemaType: ["object", "boolean"],
    code({ keyword, parentSchema, it }) {
        if (parentSchema.if === undefined)
            (0, util_1.checkStrictMode)(it, `"${keyword}" without "if" is ignored`);
    },
};
exports["default"] = def;
//# sourceMappingURL=thenElse.js.map

},
3493(__unused_rspack_module, exports, __webpack_require__) {
var __webpack_unused_export__;

__webpack_unused_export__ = ({ value: true });
exports.validateUnion = exports.validateArray = exports.usePattern = exports.callValidateCode = __webpack_unused_export__ = exports.allSchemaProperties = exports.noPropertyInData = exports.propertyInData = exports.isOwnProperty = __webpack_unused_export__ = exports.reportMissingProp = exports.checkMissingProp = exports.checkReportMissingProp = void 0;
const codegen_1 = __webpack_require__(48325);
const util_1 = __webpack_require__(53571);
const names_1 = __webpack_require__(28727);
const util_2 = __webpack_require__(53571);
function checkReportMissingProp(cxt, prop) {
    const { gen, data, it } = cxt;
    gen.if(noPropertyInData(gen, data, prop, it.opts.ownProperties), () => {
        cxt.setParams({ missingProperty: (0, codegen_1._) `${prop}` }, true);
        cxt.error();
    });
}
exports.checkReportMissingProp = checkReportMissingProp;
function checkMissingProp({ gen, data, it: { opts } }, properties, missing) {
    return (0, codegen_1.or)(...properties.map((prop) => (0, codegen_1.and)(noPropertyInData(gen, data, prop, opts.ownProperties), (0, codegen_1._) `${missing} = ${prop}`)));
}
exports.checkMissingProp = checkMissingProp;
function reportMissingProp(cxt, missing) {
    cxt.setParams({ missingProperty: missing }, true);
    cxt.error();
}
exports.reportMissingProp = reportMissingProp;
function hasPropFunc(gen) {
    return gen.scopeValue("func", {
        // eslint-disable-next-line @typescript-eslint/unbound-method
        ref: Object.prototype.hasOwnProperty,
        code: (0, codegen_1._) `Object.prototype.hasOwnProperty`,
    });
}
__webpack_unused_export__ = hasPropFunc;
function isOwnProperty(gen, data, property) {
    return (0, codegen_1._) `${hasPropFunc(gen)}.call(${data}, ${property})`;
}
exports.isOwnProperty = isOwnProperty;
function propertyInData(gen, data, property, ownProperties) {
    const cond = (0, codegen_1._) `${data}${(0, codegen_1.getProperty)(property)} !== undefined`;
    return ownProperties ? (0, codegen_1._) `${cond} && ${isOwnProperty(gen, data, property)}` : cond;
}
exports.propertyInData = propertyInData;
function noPropertyInData(gen, data, property, ownProperties) {
    const cond = (0, codegen_1._) `${data}${(0, codegen_1.getProperty)(property)} === undefined`;
    return ownProperties ? (0, codegen_1.or)(cond, (0, codegen_1.not)(isOwnProperty(gen, data, property))) : cond;
}
exports.noPropertyInData = noPropertyInData;
function allSchemaProperties(schemaMap) {
    return schemaMap ? Object.keys(schemaMap).filter((p) => p !== "__proto__") : [];
}
exports.allSchemaProperties = allSchemaProperties;
function schemaProperties(it, schemaMap) {
    return allSchemaProperties(schemaMap).filter((p) => !(0, util_1.alwaysValidSchema)(it, schemaMap[p]));
}
__webpack_unused_export__ = schemaProperties;
function callValidateCode({ schemaCode, data, it: { gen, topSchemaRef, schemaPath, errorPath }, it }, func, context, passSchema) {
    const dataAndSchema = passSchema ? (0, codegen_1._) `${schemaCode}, ${data}, ${topSchemaRef}${schemaPath}` : data;
    const valCxt = [
        [names_1.default.instancePath, (0, codegen_1.strConcat)(names_1.default.instancePath, errorPath)],
        [names_1.default.parentData, it.parentData],
        [names_1.default.parentDataProperty, it.parentDataProperty],
        [names_1.default.rootData, names_1.default.rootData],
    ];
    if (it.opts.dynamicRef)
        valCxt.push([names_1.default.dynamicAnchors, names_1.default.dynamicAnchors]);
    const args = (0, codegen_1._) `${dataAndSchema}, ${gen.object(...valCxt)}`;
    return context !== codegen_1.nil ? (0, codegen_1._) `${func}.call(${context}, ${args})` : (0, codegen_1._) `${func}(${args})`;
}
exports.callValidateCode = callValidateCode;
const newRegExp = (0, codegen_1._) `new RegExp`;
function usePattern({ gen, it: { opts } }, pattern) {
    const u = opts.unicodeRegExp ? "u" : "";
    const { regExp } = opts.code;
    const rx = regExp(pattern, u);
    return gen.scopeValue("pattern", {
        key: rx.toString(),
        ref: rx,
        code: (0, codegen_1._) `${regExp.code === "new RegExp" ? newRegExp : (0, util_2.useFunc)(gen, regExp)}(${pattern}, ${u})`,
    });
}
exports.usePattern = usePattern;
function validateArray(cxt) {
    const { gen, data, keyword, it } = cxt;
    const valid = gen.name("valid");
    if (it.allErrors) {
        const validArr = gen.let("valid", true);
        validateItems(() => gen.assign(validArr, false));
        return validArr;
    }
    gen.var(valid, true);
    validateItems(() => gen.break());
    return valid;
    function validateItems(notValid) {
        const len = gen.const("len", (0, codegen_1._) `${data}.length`);
        gen.forRange("i", 0, len, (i) => {
            cxt.subschema({
                keyword,
                dataProp: i,
                dataPropType: util_1.Type.Num,
            }, valid);
            gen.if((0, codegen_1.not)(valid), notValid);
        });
    }
}
exports.validateArray = validateArray;
function validateUnion(cxt) {
    const { gen, schema, keyword, it } = cxt;
    /* istanbul ignore if */
    if (!Array.isArray(schema))
        throw new Error("ajv implementation error");
    const alwaysValid = schema.some((sch) => (0, util_1.alwaysValidSchema)(it, sch));
    if (alwaysValid && !it.opts.unevaluated)
        return;
    const valid = gen.let("valid", false);
    const schValid = gen.name("_valid");
    gen.block(() => schema.forEach((_sch, i) => {
        const schCxt = cxt.subschema({
            keyword,
            schemaProp: i,
            compositeRule: true,
        }, schValid);
        gen.assign(valid, (0, codegen_1._) `${valid} || ${schValid}`);
        const merged = cxt.mergeValidEvaluated(schCxt, schValid);
        // can short-circuit if `unevaluatedProperties/Items` not supported (opts.unevaluated !== true)
        // or if all properties and items were evaluated (it.props === true && it.items === true)
        if (!merged)
            gen.if((0, codegen_1.not)(valid));
    }));
    cxt.result(valid, () => cxt.reset(), () => cxt.error(true));
}
exports.validateUnion = validateUnion;
//# sourceMappingURL=code.js.map

},
20452(__unused_rspack_module, exports) {
var __webpack_unused_export__;

__webpack_unused_export__ = ({ value: true });
const def = {
    keyword: "id",
    code() {
        throw new Error('NOT SUPPORTED: keyword "id", use "$id" for schema ID');
    },
};
exports["default"] = def;
//# sourceMappingURL=id.js.map

},
54736(__unused_rspack_module, exports, __webpack_require__) {
var __webpack_unused_export__;

__webpack_unused_export__ = ({ value: true });
const id_1 = __webpack_require__(20452);
const ref_1 = __webpack_require__(15309);
const core = [
    "$schema",
    "$id",
    "$defs",
    "$vocabulary",
    { keyword: "$comment" },
    "definitions",
    id_1.default,
    ref_1.default,
];
exports["default"] = core;
//# sourceMappingURL=index.js.map

},
15309(__unused_rspack_module, exports, __webpack_require__) {
var __webpack_unused_export__;

__webpack_unused_export__ = ({ value: true });
__webpack_unused_export__ = __webpack_unused_export__ = void 0;
const ref_error_1 = __webpack_require__(29319);
const code_1 = __webpack_require__(3493);
const codegen_1 = __webpack_require__(48325);
const names_1 = __webpack_require__(28727);
const compile_1 = __webpack_require__(53403);
const util_1 = __webpack_require__(53571);
const def = {
    keyword: "$ref",
    schemaType: "string",
    code(cxt) {
        const { gen, schema: $ref, it } = cxt;
        const { baseId, schemaEnv: env, validateName, opts, self } = it;
        const { root } = env;
        if (($ref === "#" || $ref === "#/") && baseId === root.baseId)
            return callRootRef();
        const schOrEnv = compile_1.resolveRef.call(self, root, baseId, $ref);
        if (schOrEnv === undefined)
            throw new ref_error_1.default(it.opts.uriResolver, baseId, $ref);
        if (schOrEnv instanceof compile_1.SchemaEnv)
            return callValidate(schOrEnv);
        return inlineRefSchema(schOrEnv);
        function callRootRef() {
            if (env === root)
                return callRef(cxt, validateName, env, env.$async);
            const rootName = gen.scopeValue("root", { ref: root });
            return callRef(cxt, (0, codegen_1._) `${rootName}.validate`, root, root.$async);
        }
        function callValidate(sch) {
            const v = getValidate(cxt, sch);
            callRef(cxt, v, sch, sch.$async);
        }
        function inlineRefSchema(sch) {
            const schName = gen.scopeValue("schema", opts.code.source === true ? { ref: sch, code: (0, codegen_1.stringify)(sch) } : { ref: sch });
            const valid = gen.name("valid");
            const schCxt = cxt.subschema({
                schema: sch,
                dataTypes: [],
                schemaPath: codegen_1.nil,
                topSchemaRef: schName,
                errSchemaPath: $ref,
            }, valid);
            cxt.mergeEvaluated(schCxt);
            cxt.ok(valid);
        }
    },
};
function getValidate(cxt, sch) {
    const { gen } = cxt;
    return sch.validate
        ? gen.scopeValue("validate", { ref: sch.validate })
        : (0, codegen_1._) `${gen.scopeValue("wrapper", { ref: sch })}.validate`;
}
__webpack_unused_export__ = getValidate;
function callRef(cxt, v, sch, $async) {
    const { gen, it } = cxt;
    const { allErrors, schemaEnv: env, opts } = it;
    const passCxt = opts.passContext ? names_1.default.this : codegen_1.nil;
    if ($async)
        callAsyncRef();
    else
        callSyncRef();
    function callAsyncRef() {
        if (!env.$async)
            throw new Error("async schema referenced by sync schema");
        const valid = gen.let("valid");
        gen.try(() => {
            gen.code((0, codegen_1._) `await ${(0, code_1.callValidateCode)(cxt, v, passCxt)}`);
            addEvaluatedFrom(v); // TODO will not work with async, it has to be returned with the result
            if (!allErrors)
                gen.assign(valid, true);
        }, (e) => {
            gen.if((0, codegen_1._) `!(${e} instanceof ${it.ValidationError})`, () => gen.throw(e));
            addErrorsFrom(e);
            if (!allErrors)
                gen.assign(valid, false);
        });
        cxt.ok(valid);
    }
    function callSyncRef() {
        cxt.result((0, code_1.callValidateCode)(cxt, v, passCxt), () => addEvaluatedFrom(v), () => addErrorsFrom(v));
    }
    function addErrorsFrom(source) {
        const errs = (0, codegen_1._) `${source}.errors`;
        gen.assign(names_1.default.vErrors, (0, codegen_1._) `${names_1.default.vErrors} === null ? ${errs} : ${names_1.default.vErrors}.concat(${errs})`); // TODO tagged
        gen.assign(names_1.default.errors, (0, codegen_1._) `${names_1.default.vErrors}.length`);
    }
    function addEvaluatedFrom(source) {
        var _a;
        if (!it.opts.unevaluated)
            return;
        const schEvaluated = (_a = sch === null || sch === void 0 ? void 0 : sch.validate) === null || _a === void 0 ? void 0 : _a.evaluated;
        // TODO refactor
        if (it.props !== true) {
            if (schEvaluated && !schEvaluated.dynamicProps) {
                if (schEvaluated.props !== undefined) {
                    it.props = util_1.mergeEvaluated.props(gen, schEvaluated.props, it.props);
                }
            }
            else {
                const props = gen.var("props", (0, codegen_1._) `${source}.evaluated.props`);
                it.props = util_1.mergeEvaluated.props(gen, props, it.props, codegen_1.Name);
            }
        }
        if (it.items !== true) {
            if (schEvaluated && !schEvaluated.dynamicItems) {
                if (schEvaluated.items !== undefined) {
                    it.items = util_1.mergeEvaluated.items(gen, schEvaluated.items, it.items);
                }
            }
            else {
                const items = gen.var("items", (0, codegen_1._) `${source}.evaluated.items`);
                it.items = util_1.mergeEvaluated.items(gen, items, it.items, codegen_1.Name);
            }
        }
    }
}
__webpack_unused_export__ = callRef;
exports["default"] = def;
//# sourceMappingURL=ref.js.map

},
74717(__unused_rspack_module, exports, __webpack_require__) {
var __webpack_unused_export__;

__webpack_unused_export__ = ({ value: true });
const codegen_1 = __webpack_require__(48325);
const types_1 = __webpack_require__(51076);
const compile_1 = __webpack_require__(53403);
const ref_error_1 = __webpack_require__(29319);
const util_1 = __webpack_require__(53571);
const error = {
    message: ({ params: { discrError, tagName } }) => discrError === types_1.DiscrError.Tag
        ? `tag "${tagName}" must be string`
        : `value of tag "${tagName}" must be in oneOf`,
    params: ({ params: { discrError, tag, tagName } }) => (0, codegen_1._) `{error: ${discrError}, tag: ${tagName}, tagValue: ${tag}}`,
};
const def = {
    keyword: "discriminator",
    type: "object",
    schemaType: "object",
    error,
    code(cxt) {
        const { gen, data, schema, parentSchema, it } = cxt;
        const { oneOf } = parentSchema;
        if (!it.opts.discriminator) {
            throw new Error("discriminator: requires discriminator option");
        }
        const tagName = schema.propertyName;
        if (typeof tagName != "string")
            throw new Error("discriminator: requires propertyName");
        if (schema.mapping)
            throw new Error("discriminator: mapping is not supported");
        if (!oneOf)
            throw new Error("discriminator: requires oneOf keyword");
        const valid = gen.let("valid", false);
        const tag = gen.const("tag", (0, codegen_1._) `${data}${(0, codegen_1.getProperty)(tagName)}`);
        gen.if((0, codegen_1._) `typeof ${tag} == "string"`, () => validateMapping(), () => cxt.error(false, { discrError: types_1.DiscrError.Tag, tag, tagName }));
        cxt.ok(valid);
        function validateMapping() {
            const mapping = getMapping();
            gen.if(false);
            for (const tagValue in mapping) {
                gen.elseIf((0, codegen_1._) `${tag} === ${tagValue}`);
                gen.assign(valid, applyTagSchema(mapping[tagValue]));
            }
            gen.else();
            cxt.error(false, { discrError: types_1.DiscrError.Mapping, tag, tagName });
            gen.endIf();
        }
        function applyTagSchema(schemaProp) {
            const _valid = gen.name("valid");
            const schCxt = cxt.subschema({ keyword: "oneOf", schemaProp }, _valid);
            cxt.mergeEvaluated(schCxt, codegen_1.Name);
            return _valid;
        }
        function getMapping() {
            var _a;
            const oneOfMapping = {};
            const topRequired = hasRequired(parentSchema);
            let tagRequired = true;
            for (let i = 0; i < oneOf.length; i++) {
                let sch = oneOf[i];
                if ((sch === null || sch === void 0 ? void 0 : sch.$ref) && !(0, util_1.schemaHasRulesButRef)(sch, it.self.RULES)) {
                    const ref = sch.$ref;
                    sch = compile_1.resolveRef.call(it.self, it.schemaEnv.root, it.baseId, ref);
                    if (sch instanceof compile_1.SchemaEnv)
                        sch = sch.schema;
                    if (sch === undefined)
                        throw new ref_error_1.default(it.opts.uriResolver, it.baseId, ref);
                }
                const propSch = (_a = sch === null || sch === void 0 ? void 0 : sch.properties) === null || _a === void 0 ? void 0 : _a[tagName];
                if (typeof propSch != "object") {
                    throw new Error(`discriminator: oneOf subschemas (or referenced schemas) must have "properties/${tagName}"`);
                }
                tagRequired = tagRequired && (topRequired || hasRequired(sch));
                addMappings(propSch, i);
            }
            if (!tagRequired)
                throw new Error(`discriminator: "${tagName}" must be required`);
            return oneOfMapping;
            function hasRequired({ required }) {
                return Array.isArray(required) && required.includes(tagName);
            }
            function addMappings(sch, i) {
                if (sch.const) {
                    addMapping(sch.const, i);
                }
                else if (sch.enum) {
                    for (const tagValue of sch.enum) {
                        addMapping(tagValue, i);
                    }
                }
                else {
                    throw new Error(`discriminator: "properties/${tagName}" must have "const" or "enum"`);
                }
            }
            function addMapping(tagValue, i) {
                if (typeof tagValue != "string" || tagValue in oneOfMapping) {
                    throw new Error(`discriminator: "${tagName}" values must be unique strings`);
                }
                oneOfMapping[tagValue] = i;
            }
        }
    },
};
exports["default"] = def;
//# sourceMappingURL=index.js.map

},
51076(__unused_rspack_module, exports) {
var __webpack_unused_export__;

__webpack_unused_export__ = ({ value: true });
exports.DiscrError = void 0;
var DiscrError;
(function (DiscrError) {
    DiscrError["Tag"] = "tag";
    DiscrError["Mapping"] = "mapping";
})(DiscrError || (exports.DiscrError = DiscrError = {}));
//# sourceMappingURL=types.js.map

},
92656(__unused_rspack_module, exports, __webpack_require__) {
var __webpack_unused_export__;

__webpack_unused_export__ = ({ value: true });
const core_1 = __webpack_require__(54736);
const validation_1 = __webpack_require__(19236);
const applicator_1 = __webpack_require__(73546);
const format_1 = __webpack_require__(73900);
const metadata_1 = __webpack_require__(12401);
const draft7Vocabularies = [
    core_1.default,
    validation_1.default,
    (0, applicator_1.default)(),
    format_1.default,
    metadata_1.metadataVocabulary,
    metadata_1.contentVocabulary,
];
exports["default"] = draft7Vocabularies;
//# sourceMappingURL=draft7.js.map

},
95585(__unused_rspack_module, exports, __webpack_require__) {
var __webpack_unused_export__;

__webpack_unused_export__ = ({ value: true });
const codegen_1 = __webpack_require__(48325);
const error = {
    message: ({ schemaCode }) => (0, codegen_1.str) `must match format "${schemaCode}"`,
    params: ({ schemaCode }) => (0, codegen_1._) `{format: ${schemaCode}}`,
};
const def = {
    keyword: "format",
    type: ["number", "string"],
    schemaType: "string",
    $data: true,
    error,
    code(cxt, ruleType) {
        const { gen, data, $data, schema, schemaCode, it } = cxt;
        const { opts, errSchemaPath, schemaEnv, self } = it;
        if (!opts.validateFormats)
            return;
        if ($data)
            validate$DataFormat();
        else
            validateFormat();
        function validate$DataFormat() {
            const fmts = gen.scopeValue("formats", {
                ref: self.formats,
                code: opts.code.formats,
            });
            const fDef = gen.const("fDef", (0, codegen_1._) `${fmts}[${schemaCode}]`);
            const fType = gen.let("fType");
            const format = gen.let("format");
            // TODO simplify
            gen.if((0, codegen_1._) `typeof ${fDef} == "object" && !(${fDef} instanceof RegExp)`, () => gen.assign(fType, (0, codegen_1._) `${fDef}.type || "string"`).assign(format, (0, codegen_1._) `${fDef}.validate`), () => gen.assign(fType, (0, codegen_1._) `"string"`).assign(format, fDef));
            cxt.fail$data((0, codegen_1.or)(unknownFmt(), invalidFmt()));
            function unknownFmt() {
                if (opts.strictSchema === false)
                    return codegen_1.nil;
                return (0, codegen_1._) `${schemaCode} && !${format}`;
            }
            function invalidFmt() {
                const callFormat = schemaEnv.$async
                    ? (0, codegen_1._) `(${fDef}.async ? await ${format}(${data}) : ${format}(${data}))`
                    : (0, codegen_1._) `${format}(${data})`;
                const validData = (0, codegen_1._) `(typeof ${format} == "function" ? ${callFormat} : ${format}.test(${data}))`;
                return (0, codegen_1._) `${format} && ${format} !== true && ${fType} === ${ruleType} && !${validData}`;
            }
        }
        function validateFormat() {
            const formatDef = self.formats[schema];
            if (!formatDef) {
                unknownFormat();
                return;
            }
            if (formatDef === true)
                return;
            const [fmtType, format, fmtRef] = getFormat(formatDef);
            if (fmtType === ruleType)
                cxt.pass(validCondition());
            function unknownFormat() {
                if (opts.strictSchema === false) {
                    self.logger.warn(unknownMsg());
                    return;
                }
                throw new Error(unknownMsg());
                function unknownMsg() {
                    return `unknown format "${schema}" ignored in schema at path "${errSchemaPath}"`;
                }
            }
            function getFormat(fmtDef) {
                const code = fmtDef instanceof RegExp
                    ? (0, codegen_1.regexpCode)(fmtDef)
                    : opts.code.formats
                        ? (0, codegen_1._) `${opts.code.formats}${(0, codegen_1.getProperty)(schema)}`
                        : undefined;
                const fmt = gen.scopeValue("formats", { key: schema, ref: fmtDef, code });
                if (typeof fmtDef == "object" && !(fmtDef instanceof RegExp)) {
                    return [fmtDef.type || "string", fmtDef.validate, (0, codegen_1._) `${fmt}.validate`];
                }
                return ["string", fmtDef, fmt];
            }
            function validCondition() {
                if (typeof formatDef == "object" && !(formatDef instanceof RegExp) && formatDef.async) {
                    if (!schemaEnv.$async)
                        throw new Error("async format in sync schema");
                    return (0, codegen_1._) `await ${fmtRef}(${data})`;
                }
                return typeof format == "function" ? (0, codegen_1._) `${fmtRef}(${data})` : (0, codegen_1._) `${fmtRef}.test(${data})`;
            }
        }
    },
};
exports["default"] = def;
//# sourceMappingURL=format.js.map

},
73900(__unused_rspack_module, exports, __webpack_require__) {
var __webpack_unused_export__;

__webpack_unused_export__ = ({ value: true });
const format_1 = __webpack_require__(95585);
const format = [format_1.default];
exports["default"] = format;
//# sourceMappingURL=index.js.map

},
12401(__unused_rspack_module, exports) {
var __webpack_unused_export__;

__webpack_unused_export__ = ({ value: true });
exports.contentVocabulary = exports.metadataVocabulary = void 0;
exports.metadataVocabulary = [
    "title",
    "description",
    "default",
    "deprecated",
    "readOnly",
    "writeOnly",
    "examples",
];
exports.contentVocabulary = [
    "contentMediaType",
    "contentEncoding",
    "contentSchema",
];
//# sourceMappingURL=metadata.js.map

},
53135(__unused_rspack_module, exports, __webpack_require__) {
var __webpack_unused_export__;

__webpack_unused_export__ = ({ value: true });
const codegen_1 = __webpack_require__(48325);
const util_1 = __webpack_require__(53571);
const equal_1 = __webpack_require__(18154);
const error = {
    message: "must be equal to constant",
    params: ({ schemaCode }) => (0, codegen_1._) `{allowedValue: ${schemaCode}}`,
};
const def = {
    keyword: "const",
    $data: true,
    error,
    code(cxt) {
        const { gen, data, $data, schemaCode, schema } = cxt;
        if ($data || (schema && typeof schema == "object")) {
            cxt.fail$data((0, codegen_1._) `!${(0, util_1.useFunc)(gen, equal_1.default)}(${data}, ${schemaCode})`);
        }
        else {
            cxt.fail((0, codegen_1._) `${schema} !== ${data}`);
        }
    },
};
exports["default"] = def;
//# sourceMappingURL=const.js.map

},
64723(__unused_rspack_module, exports, __webpack_require__) {
var __webpack_unused_export__;

__webpack_unused_export__ = ({ value: true });
const codegen_1 = __webpack_require__(48325);
const util_1 = __webpack_require__(53571);
const equal_1 = __webpack_require__(18154);
const error = {
    message: "must be equal to one of the allowed values",
    params: ({ schemaCode }) => (0, codegen_1._) `{allowedValues: ${schemaCode}}`,
};
const def = {
    keyword: "enum",
    schemaType: "array",
    $data: true,
    error,
    code(cxt) {
        const { gen, data, $data, schema, schemaCode, it } = cxt;
        if (!$data && schema.length === 0)
            throw new Error("enum must have non-empty array");
        const useLoop = schema.length >= it.opts.loopEnum;
        let eql;
        const getEql = () => (eql !== null && eql !== void 0 ? eql : (eql = (0, util_1.useFunc)(gen, equal_1.default)));
        let valid;
        if (useLoop || $data) {
            valid = gen.let("valid");
            cxt.block$data(valid, loopEnum);
        }
        else {
            /* istanbul ignore if */
            if (!Array.isArray(schema))
                throw new Error("ajv implementation error");
            const vSchema = gen.const("vSchema", schemaCode);
            valid = (0, codegen_1.or)(...schema.map((_x, i) => equalCode(vSchema, i)));
        }
        cxt.pass(valid);
        function loopEnum() {
            gen.assign(valid, false);
            gen.forOf("v", schemaCode, (v) => gen.if((0, codegen_1._) `${getEql()}(${data}, ${v})`, () => gen.assign(valid, true).break()));
        }
        function equalCode(vSchema, i) {
            const sch = schema[i];
            return typeof sch === "object" && sch !== null
                ? (0, codegen_1._) `${getEql()}(${data}, ${vSchema}[${i}])`
                : (0, codegen_1._) `${data} === ${sch}`;
        }
    },
};
exports["default"] = def;
//# sourceMappingURL=enum.js.map

},
19236(__unused_rspack_module, exports, __webpack_require__) {
var __webpack_unused_export__;

__webpack_unused_export__ = ({ value: true });
const limitNumber_1 = __webpack_require__(99098);
const multipleOf_1 = __webpack_require__(57727);
const limitLength_1 = __webpack_require__(41451);
const pattern_1 = __webpack_require__(23238);
const limitProperties_1 = __webpack_require__(90726);
const required_1 = __webpack_require__(29219);
const limitItems_1 = __webpack_require__(86555);
const uniqueItems_1 = __webpack_require__(6649);
const const_1 = __webpack_require__(53135);
const enum_1 = __webpack_require__(64723);
const validation = [
    // number
    limitNumber_1.default,
    multipleOf_1.default,
    // string
    limitLength_1.default,
    pattern_1.default,
    // object
    limitProperties_1.default,
    required_1.default,
    // array
    limitItems_1.default,
    uniqueItems_1.default,
    // any
    { keyword: "type", schemaType: ["string", "array"] },
    { keyword: "nullable", schemaType: "boolean" },
    const_1.default,
    enum_1.default,
];
exports["default"] = validation;
//# sourceMappingURL=index.js.map

},
86555(__unused_rspack_module, exports, __webpack_require__) {
var __webpack_unused_export__;

__webpack_unused_export__ = ({ value: true });
const codegen_1 = __webpack_require__(48325);
const error = {
    message({ keyword, schemaCode }) {
        const comp = keyword === "maxItems" ? "more" : "fewer";
        return (0, codegen_1.str) `must NOT have ${comp} than ${schemaCode} items`;
    },
    params: ({ schemaCode }) => (0, codegen_1._) `{limit: ${schemaCode}}`,
};
const def = {
    keyword: ["maxItems", "minItems"],
    type: "array",
    schemaType: "number",
    $data: true,
    error,
    code(cxt) {
        const { keyword, data, schemaCode } = cxt;
        const op = keyword === "maxItems" ? codegen_1.operators.GT : codegen_1.operators.LT;
        cxt.fail$data((0, codegen_1._) `${data}.length ${op} ${schemaCode}`);
    },
};
exports["default"] = def;
//# sourceMappingURL=limitItems.js.map

},
41451(__unused_rspack_module, exports, __webpack_require__) {
var __webpack_unused_export__;

__webpack_unused_export__ = ({ value: true });
const codegen_1 = __webpack_require__(48325);
const util_1 = __webpack_require__(53571);
const ucs2length_1 = __webpack_require__(45325);
const error = {
    message({ keyword, schemaCode }) {
        const comp = keyword === "maxLength" ? "more" : "fewer";
        return (0, codegen_1.str) `must NOT have ${comp} than ${schemaCode} characters`;
    },
    params: ({ schemaCode }) => (0, codegen_1._) `{limit: ${schemaCode}}`,
};
const def = {
    keyword: ["maxLength", "minLength"],
    type: "string",
    schemaType: "number",
    $data: true,
    error,
    code(cxt) {
        const { keyword, data, schemaCode, it } = cxt;
        const op = keyword === "maxLength" ? codegen_1.operators.GT : codegen_1.operators.LT;
        const len = it.opts.unicode === false ? (0, codegen_1._) `${data}.length` : (0, codegen_1._) `${(0, util_1.useFunc)(cxt.gen, ucs2length_1.default)}(${data})`;
        cxt.fail$data((0, codegen_1._) `${len} ${op} ${schemaCode}`);
    },
};
exports["default"] = def;
//# sourceMappingURL=limitLength.js.map

},
99098(__unused_rspack_module, exports, __webpack_require__) {
var __webpack_unused_export__;

__webpack_unused_export__ = ({ value: true });
const codegen_1 = __webpack_require__(48325);
const ops = codegen_1.operators;
const KWDs = {
    maximum: { okStr: "<=", ok: ops.LTE, fail: ops.GT },
    minimum: { okStr: ">=", ok: ops.GTE, fail: ops.LT },
    exclusiveMaximum: { okStr: "<", ok: ops.LT, fail: ops.GTE },
    exclusiveMinimum: { okStr: ">", ok: ops.GT, fail: ops.LTE },
};
const error = {
    message: ({ keyword, schemaCode }) => (0, codegen_1.str) `must be ${KWDs[keyword].okStr} ${schemaCode}`,
    params: ({ keyword, schemaCode }) => (0, codegen_1._) `{comparison: ${KWDs[keyword].okStr}, limit: ${schemaCode}}`,
};
const def = {
    keyword: Object.keys(KWDs),
    type: "number",
    schemaType: "number",
    $data: true,
    error,
    code(cxt) {
        const { keyword, data, schemaCode } = cxt;
        cxt.fail$data((0, codegen_1._) `${data} ${KWDs[keyword].fail} ${schemaCode} || isNaN(${data})`);
    },
};
exports["default"] = def;
//# sourceMappingURL=limitNumber.js.map

},
90726(__unused_rspack_module, exports, __webpack_require__) {
var __webpack_unused_export__;

__webpack_unused_export__ = ({ value: true });
const codegen_1 = __webpack_require__(48325);
const error = {
    message({ keyword, schemaCode }) {
        const comp = keyword === "maxProperties" ? "more" : "fewer";
        return (0, codegen_1.str) `must NOT have ${comp} than ${schemaCode} properties`;
    },
    params: ({ schemaCode }) => (0, codegen_1._) `{limit: ${schemaCode}}`,
};
const def = {
    keyword: ["maxProperties", "minProperties"],
    type: "object",
    schemaType: "number",
    $data: true,
    error,
    code(cxt) {
        const { keyword, data, schemaCode } = cxt;
        const op = keyword === "maxProperties" ? codegen_1.operators.GT : codegen_1.operators.LT;
        cxt.fail$data((0, codegen_1._) `Object.keys(${data}).length ${op} ${schemaCode}`);
    },
};
exports["default"] = def;
//# sourceMappingURL=limitProperties.js.map

},
57727(__unused_rspack_module, exports, __webpack_require__) {
var __webpack_unused_export__;

__webpack_unused_export__ = ({ value: true });
const codegen_1 = __webpack_require__(48325);
const error = {
    message: ({ schemaCode }) => (0, codegen_1.str) `must be multiple of ${schemaCode}`,
    params: ({ schemaCode }) => (0, codegen_1._) `{multipleOf: ${schemaCode}}`,
};
const def = {
    keyword: "multipleOf",
    type: "number",
    schemaType: "number",
    $data: true,
    error,
    code(cxt) {
        const { gen, data, schemaCode, it } = cxt;
        // const bdt = bad$DataType(schemaCode, <string>def.schemaType, $data)
        const prec = it.opts.multipleOfPrecision;
        const res = gen.let("res");
        const invalid = prec
            ? (0, codegen_1._) `Math.abs(Math.round(${res}) - ${res}) > 1e-${prec}`
            : (0, codegen_1._) `${res} !== parseInt(${res})`;
        cxt.fail$data((0, codegen_1._) `(${schemaCode} === 0 || (${res} = ${data}/${schemaCode}, ${invalid}))`);
    },
};
exports["default"] = def;
//# sourceMappingURL=multipleOf.js.map

},
23238(__unused_rspack_module, exports, __webpack_require__) {
var __webpack_unused_export__;

__webpack_unused_export__ = ({ value: true });
const code_1 = __webpack_require__(3493);
const util_1 = __webpack_require__(53571);
const codegen_1 = __webpack_require__(48325);
const error = {
    message: ({ schemaCode }) => (0, codegen_1.str) `must match pattern "${schemaCode}"`,
    params: ({ schemaCode }) => (0, codegen_1._) `{pattern: ${schemaCode}}`,
};
const def = {
    keyword: "pattern",
    type: "string",
    schemaType: "string",
    $data: true,
    error,
    code(cxt) {
        const { gen, data, $data, schema, schemaCode, it } = cxt;
        const u = it.opts.unicodeRegExp ? "u" : "";
        if ($data) {
            const { regExp } = it.opts.code;
            const regExpCode = regExp.code === "new RegExp" ? (0, codegen_1._) `new RegExp` : (0, util_1.useFunc)(gen, regExp);
            const valid = gen.let("valid");
            gen.try(() => gen.assign(valid, (0, codegen_1._) `${regExpCode}(${schemaCode}, ${u}).test(${data})`), () => gen.assign(valid, false));
            cxt.fail$data((0, codegen_1._) `!${valid}`);
        }
        else {
            const regExp = (0, code_1.usePattern)(cxt, schema);
            cxt.fail$data((0, codegen_1._) `!${regExp}.test(${data})`);
        }
    },
};
exports["default"] = def;
//# sourceMappingURL=pattern.js.map

},
29219(__unused_rspack_module, exports, __webpack_require__) {
var __webpack_unused_export__;

__webpack_unused_export__ = ({ value: true });
const code_1 = __webpack_require__(3493);
const codegen_1 = __webpack_require__(48325);
const util_1 = __webpack_require__(53571);
const error = {
    message: ({ params: { missingProperty } }) => (0, codegen_1.str) `must have required property '${missingProperty}'`,
    params: ({ params: { missingProperty } }) => (0, codegen_1._) `{missingProperty: ${missingProperty}}`,
};
const def = {
    keyword: "required",
    type: "object",
    schemaType: "array",
    $data: true,
    error,
    code(cxt) {
        const { gen, schema, schemaCode, data, $data, it } = cxt;
        const { opts } = it;
        if (!$data && schema.length === 0)
            return;
        const useLoop = schema.length >= opts.loopRequired;
        if (it.allErrors)
            allErrorsMode();
        else
            exitOnErrorMode();
        if (opts.strictRequired) {
            const props = cxt.parentSchema.properties;
            const { definedProperties } = cxt.it;
            for (const requiredKey of schema) {
                if ((props === null || props === void 0 ? void 0 : props[requiredKey]) === undefined && !definedProperties.has(requiredKey)) {
                    const schemaPath = it.schemaEnv.baseId + it.errSchemaPath;
                    const msg = `required property "${requiredKey}" is not defined at "${schemaPath}" (strictRequired)`;
                    (0, util_1.checkStrictMode)(it, msg, it.opts.strictRequired);
                }
            }
        }
        function allErrorsMode() {
            if (useLoop || $data) {
                cxt.block$data(codegen_1.nil, loopAllRequired);
            }
            else {
                for (const prop of schema) {
                    (0, code_1.checkReportMissingProp)(cxt, prop);
                }
            }
        }
        function exitOnErrorMode() {
            const missing = gen.let("missing");
            if (useLoop || $data) {
                const valid = gen.let("valid", true);
                cxt.block$data(valid, () => loopUntilMissing(missing, valid));
                cxt.ok(valid);
            }
            else {
                gen.if((0, code_1.checkMissingProp)(cxt, schema, missing));
                (0, code_1.reportMissingProp)(cxt, missing);
                gen.else();
            }
        }
        function loopAllRequired() {
            gen.forOf("prop", schemaCode, (prop) => {
                cxt.setParams({ missingProperty: prop });
                gen.if((0, code_1.noPropertyInData)(gen, data, prop, opts.ownProperties), () => cxt.error());
            });
        }
        function loopUntilMissing(missing, valid) {
            cxt.setParams({ missingProperty: missing });
            gen.forOf(missing, schemaCode, () => {
                gen.assign(valid, (0, code_1.propertyInData)(gen, data, missing, opts.ownProperties));
                gen.if((0, codegen_1.not)(valid), () => {
                    cxt.error();
                    gen.break();
                });
            }, codegen_1.nil);
        }
    },
};
exports["default"] = def;
//# sourceMappingURL=required.js.map

},
6649(__unused_rspack_module, exports, __webpack_require__) {
var __webpack_unused_export__;

__webpack_unused_export__ = ({ value: true });
const dataType_1 = __webpack_require__(87568);
const codegen_1 = __webpack_require__(48325);
const util_1 = __webpack_require__(53571);
const equal_1 = __webpack_require__(18154);
const error = {
    message: ({ params: { i, j } }) => (0, codegen_1.str) `must NOT have duplicate items (items ## ${j} and ${i} are identical)`,
    params: ({ params: { i, j } }) => (0, codegen_1._) `{i: ${i}, j: ${j}}`,
};
const def = {
    keyword: "uniqueItems",
    type: "array",
    schemaType: "boolean",
    $data: true,
    error,
    code(cxt) {
        const { gen, data, $data, schema, parentSchema, schemaCode, it } = cxt;
        if (!$data && !schema)
            return;
        const valid = gen.let("valid");
        const itemTypes = parentSchema.items ? (0, dataType_1.getSchemaTypes)(parentSchema.items) : [];
        cxt.block$data(valid, validateUniqueItems, (0, codegen_1._) `${schemaCode} === false`);
        cxt.ok(valid);
        function validateUniqueItems() {
            const i = gen.let("i", (0, codegen_1._) `${data}.length`);
            const j = gen.let("j");
            cxt.setParams({ i, j });
            gen.assign(valid, true);
            gen.if((0, codegen_1._) `${i} > 1`, () => (canOptimize() ? loopN : loopN2)(i, j));
        }
        function canOptimize() {
            return itemTypes.length > 0 && !itemTypes.some((t) => t === "object" || t === "array");
        }
        function loopN(i, j) {
            const item = gen.name("item");
            const wrongType = (0, dataType_1.checkDataTypes)(itemTypes, item, it.opts.strictNumbers, dataType_1.DataType.Wrong);
            const indices = gen.const("indices", (0, codegen_1._) `{}`);
            gen.for((0, codegen_1._) `;${i}--;`, () => {
                gen.let(item, (0, codegen_1._) `${data}[${i}]`);
                gen.if(wrongType, (0, codegen_1._) `continue`);
                if (itemTypes.length > 1)
                    gen.if((0, codegen_1._) `typeof ${item} == "string"`, (0, codegen_1._) `${item} += "_"`);
                gen
                    .if((0, codegen_1._) `typeof ${indices}[${item}] == "number"`, () => {
                    gen.assign(j, (0, codegen_1._) `${indices}[${item}]`);
                    cxt.error();
                    gen.assign(valid, false).break();
                })
                    .code((0, codegen_1._) `${indices}[${item}] = ${i}`);
            });
        }
        function loopN2(i, j) {
            const eql = (0, util_1.useFunc)(gen, equal_1.default);
            const outer = gen.name("outer");
            gen.label(outer).for((0, codegen_1._) `;${i}--;`, () => gen.for((0, codegen_1._) `${j} = ${i}; ${j}--;`, () => gen.if((0, codegen_1._) `${eql}(${data}[${i}], ${data}[${j}])`, () => {
                cxt.error();
                gen.assign(valid, false).break(outer);
            })));
        }
    },
};
exports["default"] = def;
//# sourceMappingURL=uniqueItems.js.map

},
88992(module) {


// do not edit .js files directly - edit src/index.jst



module.exports = function equal(a, b) {
  if (a === b) return true;

  if (a && b && typeof a == 'object' && typeof b == 'object') {
    if (a.constructor !== b.constructor) return false;

    var length, i, keys;
    if (Array.isArray(a)) {
      length = a.length;
      if (length != b.length) return false;
      for (i = length; i-- !== 0;)
        if (!equal(a[i], b[i])) return false;
      return true;
    }



    if (a.constructor === RegExp) return a.source === b.source && a.flags === b.flags;
    if (a.valueOf !== Object.prototype.valueOf) return a.valueOf() === b.valueOf();
    if (a.toString !== Object.prototype.toString) return a.toString() === b.toString();

    keys = Object.keys(a);
    length = keys.length;
    if (length !== Object.keys(b).length) return false;

    for (i = length; i-- !== 0;)
      if (!Object.prototype.hasOwnProperty.call(b, keys[i])) return false;

    for (i = length; i-- !== 0;) {
      var key = keys[i];

      if (!equal(a[key], b[key])) return false;
    }

    return true;
  }

  // true if both NaN, false otherwise
  return a!==a && b!==b;
};


},
26770(module) {


var traverse = module.exports = function (schema, opts, cb) {
  // Legacy support for v0.3.1 and earlier.
  if (typeof opts == 'function') {
    cb = opts;
    opts = {};
  }

  cb = opts.cb || cb;
  var pre = (typeof cb == 'function') ? cb : cb.pre || function() {};
  var post = cb.post || function() {};

  _traverse(opts, pre, post, schema, '', schema);
};


traverse.keywords = {
  additionalItems: true,
  items: true,
  contains: true,
  additionalProperties: true,
  propertyNames: true,
  not: true,
  if: true,
  then: true,
  else: true
};

traverse.arrayKeywords = {
  items: true,
  allOf: true,
  anyOf: true,
  oneOf: true
};

traverse.propsKeywords = {
  $defs: true,
  definitions: true,
  properties: true,
  patternProperties: true,
  dependencies: true
};

traverse.skipKeywords = {
  default: true,
  enum: true,
  const: true,
  required: true,
  maximum: true,
  minimum: true,
  exclusiveMaximum: true,
  exclusiveMinimum: true,
  multipleOf: true,
  maxLength: true,
  minLength: true,
  pattern: true,
  format: true,
  maxItems: true,
  minItems: true,
  uniqueItems: true,
  maxProperties: true,
  minProperties: true
};


function _traverse(opts, pre, post, schema, jsonPtr, rootSchema, parentJsonPtr, parentKeyword, parentSchema, keyIndex) {
  if (schema && typeof schema == 'object' && !Array.isArray(schema)) {
    pre(schema, jsonPtr, rootSchema, parentJsonPtr, parentKeyword, parentSchema, keyIndex);
    for (var key in schema) {
      var sch = schema[key];
      if (Array.isArray(sch)) {
        if (key in traverse.arrayKeywords) {
          for (var i=0; i<sch.length; i++)
            _traverse(opts, pre, post, sch[i], jsonPtr + '/' + key + '/' + i, rootSchema, jsonPtr, key, schema, i);
        }
      } else if (key in traverse.propsKeywords) {
        if (sch && typeof sch == 'object') {
          for (var prop in sch)
            _traverse(opts, pre, post, sch[prop], jsonPtr + '/' + key + '/' + escapeJsonPtr(prop), rootSchema, jsonPtr, key, schema, prop);
        }
      } else if (key in traverse.keywords || (opts.allKeys && !(key in traverse.skipKeywords))) {
        _traverse(opts, pre, post, sch, jsonPtr + '/' + key, rootSchema, jsonPtr, key, schema);
      }
    }
    post(schema, jsonPtr, rootSchema, parentJsonPtr, parentKeyword, parentSchema, keyIndex);
  }
}


function escapeJsonPtr(str) {
  return str.replace(/~/g, '~0').replace(/\//g, '~1');
}


},
82938() {
throw new Error("A module excluded via the build 'ignore' option was loaded at runtime.");


},
63969(__unused_rspack_module, exports) {
var __webpack_unused_export__;

/*!
This file is part of CycloneDX JavaScript Library.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

   http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.

SPDX-License-Identifier: Apache-2.0
Copyright (c) OWASP Foundation. All Rights Reserved.
*/
__webpack_unused_export__ = ({ value: true });
exports.chainI = chainI;
function* chainI(...iterables) {
    for (const iterable of iterables) {
        for (const item of iterable) {
            yield item;
        }
    }
}
//# sourceMappingURL=iterable.js.map

},
15696(__unused_rspack_module, exports) {
var __webpack_unused_export__;

/*!
This file is part of CycloneDX JavaScript Library.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

   http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.

SPDX-License-Identifier: Apache-2.0
Copyright (c) OWASP Foundation. All Rights Reserved.
*/
__webpack_unused_export__ = ({ value: true });
exports.isNotUndefined = isNotUndefined;
function isNotUndefined(value) {
    return value !== undefined;
}
//# sourceMappingURL=notUndefined.js.map

},
56503(__unused_rspack_module, exports) {
var __webpack_unused_export__;

/*!
This file is part of CycloneDX JavaScript Library.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

   http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.

SPDX-License-Identifier: Apache-2.0
Copyright (c) OWASP Foundation. All Rights Reserved.
*/
__webpack_unused_export__ = ({ value: true });
exports.SortableNumbers = exports.SortableStringables = exports.SortableComparables = __webpack_unused_export__ = exports.MX = void 0;
exports.MX = Symbol('internal compare function');
class SortableSet extends Set {
    sorted() {
        return Array.from(this).sort(this[exports.MX]);
    }
    compare(other) {
        const sortedOther = other.sorted();
        const sortedSelf = this.sorted();
        if (sortedSelf.length !== sortedOther.length) {
            return sortedSelf.length - sortedOther.length;
        }
        for (let i = sortedSelf.length - 1; i >= 0; --i) {
            const iCompared = this[exports.MX](sortedSelf[i], sortedOther[i]);
            if (iCompared !== 0) {
                return iCompared;
            }
        }
        return 0;
    }
}
__webpack_unused_export__ = SortableSet;
class SortableComparables extends SortableSet {
    [exports.MX](a, b) {
        if (a.constructor === b.constructor) {
            return a.compare(b);
        }
        return a.constructor.name.localeCompare(b.constructor.name);
    }
}
exports.SortableComparables = SortableComparables;
class SortableStringables extends SortableSet {
    [exports.MX](a, b) {
        return a.toString().localeCompare(b.toString());
    }
}
exports.SortableStringables = SortableStringables;
class SortableNumbers extends SortableSet {
    [exports.MX](a, b) {
        return a - b;
    }
}
exports.SortableNumbers = SortableNumbers;
//# sourceMappingURL=sortable.js.map

},
39971(__unused_rspack_module, exports) {
var __webpack_unused_export__;

/*!
This file is part of CycloneDX JavaScript Library.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

   http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.

SPDX-License-Identifier: Apache-2.0
Copyright (c) OWASP Foundation. All Rights Reserved.
*/
__webpack_unused_export__ = ({ value: true });
exports.treeIteratorSymbol = void 0;
exports.treeIteratorSymbol = Symbol('iterator of a tree/nesting-like structure');
//# sourceMappingURL=tree.js.map

},
32089(__unused_rspack_module, exports) {
var __webpack_unused_export__;

/*!
This file is part of CycloneDX JavaScript Library.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

   http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.

SPDX-License-Identifier: Apache-2.0
Copyright (c) OWASP Foundation. All Rights Reserved.
*/
__webpack_unused_export__ = ({ value: true });
exports.escapeUri = escapeUri;
const _ESCAPES = [
    [/ /g, '%20'],
    [/"/g, '%22'],
    [/'/g, '%27'],
    [/\[/g, '%5B'],
    [/]/g, '%5D'],
    [/</g, '%3C'],
    [/>/g, '%3E'],
    [/\{/g, '%7B'],
    [/}/g, '%7D'],
];
function escapeUri(value) {
    if (value === undefined) {
        return value;
    }
    for (const [s, r] of _ESCAPES) {
        value = value.replace(s, r);
    }
    return value;
}
//# sourceMappingURL=uri.js.map

},
41336(__unused_rspack_module, exports, __webpack_require__) {

/*!
This file is part of CycloneDX JavaScript Library.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

   http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.

SPDX-License-Identifier: Apache-2.0
Copyright (c) OWASP Foundation. All Rights Reserved.
*/
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
const promises_1 = __webpack_require__(51455);
const ajv_1 = __importDefault(__webpack_require__(45378));
const ajv_formats_1 = __importDefault(__webpack_require__(36279));
const ajv_formats_draft2019_1 = __importDefault(__webpack_require__(82938));
const ajvOptions = Object.freeze({
    useDefaults: false,
    strict: false,
    strictSchema: false,
    addUsedSchema: false,
    loadSchema: (uri) => { throw new Error(`Remote schemas are disabled: ${uri}`); }
});
exports["default"] = (async function (schemaPath, schemaMap = {}) {
    const [schema, schemas] = await Promise.all([
        (0, promises_1.readFile)(schemaPath, 'utf-8').then(c => JSON.parse(c)),
        Promise.all(Object.entries(schemaMap).map(async ([k, v]) => await (0, promises_1.readFile)(v, 'utf-8').then(c => [k, JSON.parse(c)]))).then(es => Object.fromEntries(es))
    ]);
    const ajv = new ajv_1.default({ ...ajvOptions, schemas });
    (0, ajv_formats_1.default)(ajv);
    (0, ajv_formats_draft2019_1.default)(ajv, { formats: ['idn-email'] });
    ajv.addFormat('iri-reference', true);
    const validator = ajv.compile(schema);
    return function (data) {
        return validator(JSON.parse(data))
            ? null
            : validator.errors;
    };
});
//# sourceMappingURL=ajv.js.map

},
16730(__unused_rspack_module, exports, __webpack_require__) {
var __webpack_unused_export__;

/*!
This file is part of CycloneDX JavaScript Library.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

   http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.

SPDX-License-Identifier: Apache-2.0
Copyright (c) OWASP Foundation. All Rights Reserved.
*/
__webpack_unused_export__ = ({ value: true });
const xmlbuilder2_1 = __webpack_require__(82938);
if (typeof xmlbuilder2_1.create !== 'function') {
    throw new Error('`create` is not a function');
}
exports.A = (function (rootElement, { space } = {}) {
    const indent = makeIndent(space);
    const doc = (0, xmlbuilder2_1.create)({ encoding: 'UTF-8' });
    addEle(doc, rootElement);
    return doc.end({
        format: 'xml',
        newline: '\n',
        prettyPrint: indent.length > 0,
        indent
    });
});
function addEle(parent, element, parentNS = null) {
    if (element.type !== 'element') {
        return;
    }
    const ns = getNS(element) ?? parentNS;
    const ele = parent.ele(ns, element.name, element.attributes);
    if (element.children === undefined) {
    }
    else if (typeof element.children === 'string' || typeof element.children === 'number') {
        ele.txt(element.children.toString());
    }
    else {
        for (const child of element.children) {
            addEle(ele, child, ns);
        }
    }
}
function getNS(element) {
    const ns = (element.namespace ?? element.attributes?.xmlns)?.toString() ?? '';
    return ns.length > 0
        ? ns
        : null;
}
function makeIndent(space) {
    if (typeof space === 'number') {
        return ' '.repeat(Math.max(0, space));
    }
    if (typeof space === 'string') {
        return space;
    }
    return '';
}
//# sourceMappingURL=xmlbuilder2.js.map

},
82783(__unused_rspack_module, exports, __webpack_require__) {
var __webpack_unused_export__;

/*!
This file is part of CycloneDX JavaScript Library.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

   http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.

SPDX-License-Identifier: Apache-2.0
Copyright (c) OWASP Foundation. All Rights Reserved.
*/
__webpack_unused_export__ = ({ value: true });
const promises_1 = __webpack_require__(51455);
const node_url_1 = __webpack_require__(73136);
const libxmljs2_1 = __webpack_require__(82938);
const xmlParseOptions = Object.freeze({
    nonet: true,
    compact: true,
    noent: false,
    dtdload: false
});
exports.A = (async function (schemaPath) {
    const schema = (0, libxmljs2_1.parseXml)(await (0, promises_1.readFile)(schemaPath, 'utf-8'), { ...xmlParseOptions, baseUrl: (0, node_url_1.pathToFileURL)(schemaPath).toString() });
    return function (data) {
        const doc = (0, libxmljs2_1.parseXml)(data, xmlParseOptions);
        return doc.validate(schema)
            ? null
            : doc.validationErrors;
    };
});
//# sourceMappingURL=libxmljs2.js.map

},
56863(__unused_rspack_module, exports, __webpack_require__) {

/*!
This file is part of CycloneDX JavaScript Library.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

   http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.

SPDX-License-Identifier: Apache-2.0
Copyright (c) OWASP Foundation. All Rights Reserved.
*/
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports["default"] = default_1;
const errors_1 = __webpack_require__(56296);
function makeWIllThrow(message) {
    const f = function () {
        throw new errors_1.OptPlugError(message);
    };
    f.fails = true;
    return Object.freeze(f);
}
function default_1(name, pf) {
    for (const [, getF] of pf) {
        try {
            return getF();
        }
        catch {
        }
    }
    return makeWIllThrow(`No ${name} available.\n` +
        'Please install one of the optional dependencies: ' +
        pf.map(kv => kv[0]).join(' || '));
}
//# sourceMappingURL=_wrapper.js.map

},
56296(__unused_rspack_module, exports) {
var __webpack_unused_export__;

/*!
This file is part of CycloneDX JavaScript Library.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

   http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.

SPDX-License-Identifier: Apache-2.0
Copyright (c) OWASP Foundation. All Rights Reserved.
*/
__webpack_unused_export__ = ({ value: true });
exports.OptPlugError = void 0;
class OptPlugError extends Error {
    cause;
    constructor(message, cause) {
        super(message);
        this.cause = cause;
    }
}
exports.OptPlugError = OptPlugError;
//# sourceMappingURL=errors.js.map

},
5875(__unused_rspack_module, exports, __webpack_require__) {

/*!
This file is part of CycloneDX JavaScript Library.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

   http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.

SPDX-License-Identifier: Apache-2.0
Copyright (c) OWASP Foundation. All Rights Reserved.
*/
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
const _wrapper_1 = __importDefault(__webpack_require__(56863));
exports["default"] = (0, _wrapper_1.default)('JsonValidator', [
    ['( ajv && ajv-formats && ajv-formats-draft2019 )', () => (__webpack_require__(41336)/* ["default"] */["default"])]
]);
//# sourceMappingURL=jsonValidator.js.map

},
88021(__unused_rspack_module, exports, __webpack_require__) {

/*!
This file is part of CycloneDX JavaScript Library.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

   http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.

SPDX-License-Identifier: Apache-2.0
Copyright (c) OWASP Foundation. All Rights Reserved.
*/
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
const _wrapper_1 = __importDefault(__webpack_require__(56863));
exports["default"] = (0, _wrapper_1.default)('XmlStringifier', [
    ['xmlbuilder2', () => (__webpack_require__(16730)/* ["default"] */.A)]
]);
//# sourceMappingURL=xmlStringify.js.map

},
51762(__unused_rspack_module, exports, __webpack_require__) {

/*!
This file is part of CycloneDX JavaScript Library.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

   http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.

SPDX-License-Identifier: Apache-2.0
Copyright (c) OWASP Foundation. All Rights Reserved.
*/
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
const _wrapper_1 = __importDefault(__webpack_require__(56863));
exports["default"] = (0, _wrapper_1.default)('XmlValidator', [
    ['libxmljs2', () => (__webpack_require__(82783)/* ["default"] */.A)]
]);
//# sourceMappingURL=xmlValidator.js.map

},
78819(__unused_rspack_module, exports, __webpack_require__) {

/*!
This file is part of CycloneDX JavaScript Library.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

   http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.

SPDX-License-Identifier: Apache-2.0
Copyright (c) OWASP Foundation. All Rights Reserved.
*/
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.Utils = void 0;
exports.Utils = __importStar(__webpack_require__(73054));
//# sourceMappingURL=index.js.map

},
73054(__unused_rspack_module, exports) {

/*!
This file is part of CycloneDX JavaScript Library.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

   http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.

SPDX-License-Identifier: Apache-2.0
Copyright (c) OWASP Foundation. All Rights Reserved.
*/
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.randomSerialNumber = randomSerialNumber;
function randomSerialNumber() {
    const b = [
        Math.round(Math.random() * 0xFFFF),
        Math.round(Math.random() * 0xFFFF),
        Math.round(Math.random() * 0xFFFF),
        Math.round(Math.random() * 0x0FFF) | 0x4000,
        Math.round(Math.random() * 0x3FFF) | 0x8000,
        Math.round(Math.random() * 0xFFFF),
        Math.round(Math.random() * 0xFFFF),
        Math.round(Math.random() * 0xFFFF)
    ].map(n => n.toString(16).padStart(4, '0'));
    return `urn:uuid:${b[0]}${b[1]}-${b[2]}-${b[3]}-${b[4]}-${b[5]}${b[6]}${b[7]}`;
}
//# sourceMappingURL=utils.js.map

},
73401(__unused_rspack_module, exports) {
var __webpack_unused_export__;

/*!
This file is part of CycloneDX JavaScript Library.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

   http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.

SPDX-License-Identifier: Apache-2.0
Copyright (c) OWASP Foundation. All Rights Reserved.
*/
__webpack_unused_export__ = ({ value: true });
exports.tryCanonicalizeGitUrl = tryCanonicalizeGitUrl;
const _sshConnStringRE = /^(?<user>[^@:]+)@(?<host>[^:]+):(?<path>.*)$/;
function tryCanonicalizeGitUrl(value) {
    if (value === undefined || value.length <= 0) {
        return undefined;
    }
    try {
        return new URL(value);
    }
    catch {
    }
    const sshGs = _sshConnStringRE.exec(value)?.groups;
    if (sshGs !== undefined) {
        try {
            const u = new URL(`git+ssh://${sshGs.host}`);
            u.username = sshGs.user;
            u.pathname = sshGs.path;
            return u;
        }
        catch {
        }
    }
    return value;
}
//# sourceMappingURL=gitUrl.js.map

},
56416(__unused_rspack_module, exports) {
var __webpack_unused_export__;

/*!
This file is part of CycloneDX JavaScript Library.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

   http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.

SPDX-License-Identifier: Apache-2.0
Copyright (c) OWASP Foundation. All Rights Reserved.
*/
__webpack_unused_export__ = ({ value: true });
exports.splitNameGroup = splitNameGroup;
function splitNameGroup(data) {
    const delimGroup = data.startsWith('@')
        ? data.indexOf('/', 2)
        : 0;
    return delimGroup > 0
        ? [data.slice(delimGroup + 1), data.slice(0, delimGroup)]
        : [data, undefined];
}
//# sourceMappingURL=packageJson.js.map

},
4779(__unused_rspack_module, exports, __webpack_require__) {

/*!
This file is part of CycloneDX JavaScript Library.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

   http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.

SPDX-License-Identifier: Apache-2.0
Copyright (c) OWASP Foundation. All Rights Reserved.
*/
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.ComponentBuilder = exports.ToolBuilder = void 0;
const componentType_1 = __webpack_require__(83714);
const component_1 = __webpack_require__(93520);
const externalReference_1 = __webpack_require__(22383);
const license_1 = __webpack_require__(81884);
const tool_1 = __webpack_require__(62417);
const packageJson_1 = __webpack_require__(56416);
class ToolBuilder {
    #extRefFactory;
    constructor(extRefFactory) {
        this.#extRefFactory = extRefFactory;
    }
    get extRefFactory() {
        return this.#extRefFactory;
    }
    makeTool(data) {
        const [name, vendor] = typeof data.name === 'string'
            ? (0, packageJson_1.splitNameGroup)(data.name)
            : [];
        return new tool_1.Tool({
            vendor,
            name,
            version: (typeof data.version === 'string')
                ? data.version
                : undefined,
            externalReferences: new externalReference_1.ExternalReferenceRepository(this.#extRefFactory.makeExternalReferences(data))
        });
    }
}
exports.ToolBuilder = ToolBuilder;
class ComponentBuilder {
    #extRefFactory;
    #licenseFactory;
    constructor(extRefFactory, licenseFactory) {
        this.#extRefFactory = extRefFactory;
        this.#licenseFactory = licenseFactory;
    }
    get extRefFactory() {
        return this.#extRefFactory;
    }
    get licenseFactory() {
        return this.#licenseFactory;
    }
    makeComponent(data, type = componentType_1.ComponentType.Library) {
        if (typeof data.name !== 'string') {
            return undefined;
        }
        const [name, group] = (0, packageJson_1.splitNameGroup)(data.name);
        if (name.length <= 0) {
            return undefined;
        }
        const author = typeof data.author === 'string'
            ? data.author
            : (typeof data.author?.name === 'string'
                ? data.author.name
                : undefined);
        const description = typeof data.description === 'string'
            ? data.description
            : undefined;
        const version = typeof data.version === 'string'
            ? data.version
            : undefined;
        const externalReferences = this.#extRefFactory.makeExternalReferences(data);
        const licenses = new license_1.LicenseRepository();
        if (typeof data.license === 'string') {
            licenses.add(this.#licenseFactory.makeFromString(data.license));
        }
        if (Array.isArray(data.licenses)) {
            for (const licenseData of data.licenses) {
                if (typeof licenseData.type === 'string') {
                    const license = this.#licenseFactory.makeDisjunctive(licenseData.type);
                    license.url = typeof licenseData.url === 'string'
                        ? licenseData.url
                        : undefined;
                    licenses.add(license);
                }
            }
        }
        return new component_1.Component(type, name, {
            author,
            description,
            externalReferences: new externalReference_1.ExternalReferenceRepository(externalReferences),
            group,
            licenses,
            version
        });
    }
}
exports.ComponentBuilder = ComponentBuilder;
//# sourceMappingURL=builders.js.map

},
95905(__unused_rspack_module, exports, __webpack_require__) {

/*!
This file is part of CycloneDX JavaScript Library.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

   http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.

SPDX-License-Identifier: Apache-2.0
Copyright (c) OWASP Foundation. All Rights Reserved.
*/
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.ExternalReferenceFactory = void 0;
const notUndefined_1 = __webpack_require__(15696);
const externalReferenceType_1 = __webpack_require__(78193);
const hashAlogorithm_1 = __webpack_require__(65065);
const externalReference_1 = __webpack_require__(22383);
const hash_1 = __webpack_require__(60643);
const gitUrl_1 = __webpack_require__(73401);
const utils_1 = __webpack_require__(49254);
class ExternalReferenceFactory {
    makeExternalReferences(data) {
        const refs = [];
        try {
            refs.push(this.makeVcs(data));
        }
        catch { }
        try {
            refs.push(this.makeHomepage(data));
        }
        catch { }
        try {
            refs.push(this.makeIssueTracker(data));
        }
        catch { }
        try {
            refs.push(this.makeDist(data));
        }
        catch { }
        return refs.filter(notUndefined_1.isNotUndefined);
    }
    makeVcs(data) {
        const repository = data.repository;
        let url;
        let comment;
        if (typeof repository === 'object') {
            url = (0, gitUrl_1.tryCanonicalizeGitUrl)(repository.url);
            comment = 'as detected from PackageJson property "repository.url"';
            if (typeof repository.directory === 'string' && url instanceof URL) {
                url.hash = repository.directory.replace(/#/g, '%23');
                comment += ' and "repository.directory"';
            }
        }
        else {
            url = (0, gitUrl_1.tryCanonicalizeGitUrl)(repository);
            comment = 'as detected from PackageJson property "repository"';
        }
        return url === undefined
            ? undefined
            : new externalReference_1.ExternalReference(url.toString(), externalReferenceType_1.ExternalReferenceType.VCS, { comment });
    }
    makeHomepage(data) {
        const url = data.homepage;
        return typeof url === 'string' && url.length > 0
            ? new externalReference_1.ExternalReference(url, externalReferenceType_1.ExternalReferenceType.Website, { comment: 'as detected from PackageJson property "homepage"' })
            : undefined;
    }
    makeIssueTracker(data) {
        const bugs = data.bugs;
        let url;
        let comment;
        if (typeof bugs === 'object') {
            url = bugs.url;
            comment = 'as detected from PackageJson property "bugs.url"';
        }
        else {
            url = bugs;
            comment = 'as detected from PackageJson property "bugs"';
        }
        return typeof url === 'string' && url.length > 0
            ? new externalReference_1.ExternalReference(url, externalReferenceType_1.ExternalReferenceType.IssueTracker, { comment })
            : undefined;
    }
    makeDist(data) {
        const { tarball, integrity, shasum } = data.dist ?? {};
        if (typeof tarball === 'string') {
            const hashes = new hash_1.HashDictionary();
            let comment = 'as detected from PackageJson property "dist.tarball"';
            if (typeof integrity === 'string') {
                try {
                    hashes.set(...(0, utils_1.parsePackageIntegrity)(integrity));
                    comment += ' and property "dist.integrity"';
                }
                catch { }
            }
            if (typeof shasum === 'string' && shasum.length === 40) {
                hashes.set(hashAlogorithm_1.HashAlgorithm['SHA-1'], shasum);
                comment += ' and property "dist.shasum"';
            }
            return new externalReference_1.ExternalReference(tarball, externalReferenceType_1.ExternalReferenceType.Distribution, { hashes, comment });
        }
        return undefined;
    }
}
exports.ExternalReferenceFactory = ExternalReferenceFactory;
//# sourceMappingURL=factories.js.map

},
34301(__unused_rspack_module, exports, __webpack_require__) {

/*!
This file is part of CycloneDX JavaScript Library.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

   http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.

SPDX-License-Identifier: Apache-2.0
Copyright (c) OWASP Foundation. All Rights Reserved.
*/
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.Utils = exports.Types = exports.Factories = exports.Builders = void 0;
exports.Builders = __importStar(__webpack_require__(4779));
exports.Factories = __importStar(__webpack_require__(95905));
exports.Types = __importStar(__webpack_require__(56954));
exports.Utils = __importStar(__webpack_require__(49254));
//# sourceMappingURL=index.node.js.map

},
56954(__unused_rspack_module, exports) {

/*!
This file is part of CycloneDX JavaScript Library.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

   http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.

SPDX-License-Identifier: Apache-2.0
Copyright (c) OWASP Foundation. All Rights Reserved.
*/
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.isNodePackageJson = isNodePackageJson;
exports.assertNodePackageJson = assertNodePackageJson;
function isNodePackageJson(value) {
    throw new Error('Not implemented');
}
function assertNodePackageJson(value) {
    throw new Error('Not implemented');
}
//# sourceMappingURL=types.js.map

},
49254(__unused_rspack_module, exports, __webpack_require__) {

/*!
This file is part of CycloneDX JavaScript Library.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

   http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.

SPDX-License-Identifier: Apache-2.0
Copyright (c) OWASP Foundation. All Rights Reserved.
*/
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.defaultRegistryMatcher = void 0;
exports.parsePackageIntegrity = parsePackageIntegrity;
const hashAlogorithm_1 = __webpack_require__(65065);
const integrityRE = new Map([
    [hashAlogorithm_1.HashAlgorithm['SHA-512'], /^sha512-([a-z0-9+/]{86}==)$/i],
    [hashAlogorithm_1.HashAlgorithm['SHA-1'], /^sha1-([a-z0-9+/]{27}=)$/i],
    [hashAlogorithm_1.HashAlgorithm['SHA-256'], /^sha256-([a-z0-9+/]{43}=)$/i],
    [hashAlogorithm_1.HashAlgorithm['SHA-384'], /^sha384-([a-z0-9+/]{64})$/i]
]);
function parsePackageIntegrity(integrity) {
    for (const [hashAlgorithm, hashRE] of integrityRE) {
        const hashMatchBase64 = hashRE.exec(integrity) ?? [];
        if (hashMatchBase64.length === 2) {
            return [
                hashAlgorithm,
                Buffer.from(hashMatchBase64[1], 'base64').toString('hex')
            ];
        }
    }
    throw new RangeError('unparsable value');
}
exports.defaultRegistryMatcher = /^https?:\/\/registry\.npmjs\.org(:?\/|$)/;
//# sourceMappingURL=utils.js.map

},
14631(__unused_rspack_module, exports, __webpack_require__) {

/*!
This file is part of CycloneDX JavaScript Library.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

   http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.

SPDX-License-Identifier: Apache-2.0
Copyright (c) OWASP Foundation. All Rights Reserved.
*/
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.Bom = void 0;
exports.Bom = __importStar(__webpack_require__(78819));
//# sourceMappingURL=index.common.js.map

},
56314(__unused_rspack_module, exports, __webpack_require__) {

/*!
This file is part of CycloneDX JavaScript Library.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

   http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.

SPDX-License-Identifier: Apache-2.0
Copyright (c) OWASP Foundation. All Rights Reserved.
*/
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.License = exports.FromNodePackageJson = void 0;
__exportStar(__webpack_require__(14631), exports);
exports.FromNodePackageJson = __importStar(__webpack_require__(34301));
exports.License = __importStar(__webpack_require__(65430));
//# sourceMappingURL=index.node.js.map

},
40515(__unused_rspack_module, exports, __webpack_require__) {
var __webpack_unused_export__;

/*!
This file is part of CycloneDX JavaScript Library.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

   http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.

SPDX-License-Identifier: Apache-2.0
Copyright (c) OWASP Foundation. All Rights Reserved.
*/
__webpack_unused_export__ = ({ value: true });
exports.guessMimeTypeForLicenseFile = guessMimeTypeForLicenseFile;
const node_path_1 = __webpack_require__(76760);
const MIMETYPE_TEXT_PLAIN = 'text/plain';
const MAP_TEXT_EXTENSION_MIMETYPE = {
    '': MIMETYPE_TEXT_PLAIN,
    '.csv': 'text/csv',
    '.htm': 'text/html',
    '.html': 'text/html',
    '.md': 'text/markdown',
    '.txt': MIMETYPE_TEXT_PLAIN,
    '.rst': 'text/prs.fallenstein.rst',
    '.rtf': 'application/rtf',
    '.xml': 'text/xml',
    '.license': MIMETYPE_TEXT_PLAIN,
    '.licence': MIMETYPE_TEXT_PLAIN,
};
const LICENSE_FILENAME_BASE = new Set(['licence', 'license']);
const LICENSE_FILENAME_EXT = new Set([
    '.apache',
    '.bsd',
    '.gpl',
    '.mit',
]);
function guessMimeTypeForLicenseFile(filename) {
    const { name, ext } = (0, node_path_1.parse)(filename.toLowerCase());
    return LICENSE_FILENAME_BASE.has(name) && LICENSE_FILENAME_EXT.has(ext)
        ? MIMETYPE_TEXT_PLAIN
        : MAP_TEXT_EXTENSION_MIMETYPE[ext];
}
//# sourceMappingURL=mime.node.js.map

},
79847(__unused_rspack_module, exports, __webpack_require__) {

/*!
This file is part of CycloneDX JavaScript Library.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

   http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.

SPDX-License-Identifier: Apache-2.0
Copyright (c) OWASP Foundation. All Rights Reserved.
*/
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.LicenseFactory = void 0;
const license_1 = __webpack_require__(81884);
const spdx_1 = __webpack_require__(97517);
class LicenseFactory {
    #spdxExpressionValidate;
    constructor(spdxExpressionValidate) {
        this.#spdxExpressionValidate = spdxExpressionValidate;
    }
    makeFromString(value) {
        try {
            return this.makeSpdxLicense(value);
        }
        catch {
        }
        try {
            return this.makeExpression(value);
        }
        catch {
        }
        return this.makeNamedLicense(value);
    }
    makeExpression(value) {
        const expression = String(value);
        try {
            this.#spdxExpressionValidate(expression);
        }
        catch (err) {
            throw new RangeError('Invalid SPDX license expression', { cause: err });
        }
        return new license_1.LicenseExpression(expression);
    }
    makeDisjunctive(value) {
        try {
            return this.makeSpdxLicense(value);
        }
        catch {
            return this.makeNamedLicense(value);
        }
    }
    makeSpdxLicense(value) {
        const fixed = (0, spdx_1.fixupSpdxId)(String(value));
        if (undefined === fixed) {
            throw new RangeError('Unsupported SPDX license ID');
        }
        return new license_1.SpdxLicense(fixed);
    }
    makeNamedLicense(value) {
        return new license_1.NamedLicense(String(value));
    }
}
exports.LicenseFactory = LicenseFactory;
//# sourceMappingURL=factories.js.map

},
16491(__unused_rspack_module, exports, __webpack_require__) {

/*!
This file is part of CycloneDX JavaScript Library.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

   http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.

SPDX-License-Identifier: Apache-2.0
Copyright (c) OWASP Foundation. All Rights Reserved.
*/
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.Factories = void 0;
exports.Factories = __importStar(__webpack_require__(79847));
//# sourceMappingURL=index.common.js.map

},
65430(__unused_rspack_module, exports, __webpack_require__) {

/*!
This file is part of CycloneDX JavaScript Library.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

   http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.

SPDX-License-Identifier: Apache-2.0
Copyright (c) OWASP Foundation. All Rights Reserved.
*/
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.Utils = void 0;
__exportStar(__webpack_require__(16491), exports);
exports.Utils = __importStar(__webpack_require__(89885));
//# sourceMappingURL=index.node.js.map

},
89885(__unused_rspack_module, exports, __webpack_require__) {

/*!
This file is part of CycloneDX JavaScript Library.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

   http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.

SPDX-License-Identifier: Apache-2.0
Copyright (c) OWASP Foundation. All Rights Reserved.
*/
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.LicenseEvidenceGatherer = void 0;
const attachmentEncoding_1 = __webpack_require__(36185);
const attachment_1 = __webpack_require__(25554);
const mime_node_1 = __webpack_require__(40515);
const LICENSE_FILENAME_PATTERN = /^(?:UN)?LICEN[CS]E|.\.LICEN[CS]E$|^NOTICE$/i;
class LicenseEvidenceGatherer {
    #fs;
    #path;
    constructor(options = {}) {
        this.#fs = options.fs ?? __webpack_require__(73024);
        this.#path = options.path ?? __webpack_require__(76760);
    }
    *getFileAttachments(prefixPath, onError = noop) {
        const files = this.#fs.readdirSync(prefixPath);
        for (const file of files) {
            if (!LICENSE_FILENAME_PATTERN.test(file)) {
                continue;
            }
            const filePath = this.#path.join(prefixPath, file);
            if (!this.#fs.statSync(filePath).isFile()) {
                continue;
            }
            const contentType = (0, mime_node_1.guessMimeTypeForLicenseFile)(file);
            if (contentType === undefined) {
                continue;
            }
            try {
                yield { filePath, file, text: new attachment_1.Attachment(this.#fs.readFileSync(filePath)
                        .toString('base64'), { contentType, encoding: attachmentEncoding_1.AttachmentEncoding.Base64 }) };
            }
            catch (cause) {
                onError(new Error(`skipped license file ${filePath}`, { cause }));
            }
        }
    }
}
exports.LicenseEvidenceGatherer = LicenseEvidenceGatherer;
function noop() { }
//# sourceMappingURL=utils.node.js.map

},
36185(__unused_rspack_module, exports) {

/*!
This file is part of CycloneDX JavaScript Library.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

   http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.

SPDX-License-Identifier: Apache-2.0
Copyright (c) OWASP Foundation. All Rights Reserved.
*/
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.AttachmentEncoding = void 0;
var AttachmentEncoding;
(function (AttachmentEncoding) {
    AttachmentEncoding["Base64"] = "base64";
})(AttachmentEncoding || (exports.AttachmentEncoding = AttachmentEncoding = {}));
//# sourceMappingURL=attachmentEncoding.js.map

},
74404(__unused_rspack_module, exports) {

/*!
This file is part of CycloneDX JavaScript Library.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

   http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.

SPDX-License-Identifier: Apache-2.0
Copyright (c) OWASP Foundation. All Rights Reserved.
*/
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.ComponentScope = void 0;
var ComponentScope;
(function (ComponentScope) {
    ComponentScope["Required"] = "required";
    ComponentScope["Optional"] = "optional";
    ComponentScope["Excluded"] = "excluded";
})(ComponentScope || (exports.ComponentScope = ComponentScope = {}));
//# sourceMappingURL=componentScope.js.map

},
83714(__unused_rspack_module, exports) {

/*!
This file is part of CycloneDX JavaScript Library.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

   http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.

SPDX-License-Identifier: Apache-2.0
Copyright (c) OWASP Foundation. All Rights Reserved.
*/
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.ComponentType = void 0;
var ComponentType;
(function (ComponentType) {
    ComponentType["Application"] = "application";
    ComponentType["Framework"] = "framework";
    ComponentType["Library"] = "library";
    ComponentType["Container"] = "container";
    ComponentType["Platform"] = "platform";
    ComponentType["OperatingSystem"] = "operating-system";
    ComponentType["Device"] = "device";
    ComponentType["DeviceDriver"] = "device-driver";
    ComponentType["Firmware"] = "firmware";
    ComponentType["File"] = "file";
    ComponentType["MachineLearningModel"] = "machine-learning-model";
    ComponentType["Data"] = "data";
    ComponentType["CryptographicAsset"] = "cryptographic-asset";
})(ComponentType || (exports.ComponentType = ComponentType = {}));
//# sourceMappingURL=componentType.js.map

},
78193(__unused_rspack_module, exports) {

/*!
This file is part of CycloneDX JavaScript Library.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

   http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.

SPDX-License-Identifier: Apache-2.0
Copyright (c) OWASP Foundation. All Rights Reserved.
*/
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.ExternalReferenceType = void 0;
var ExternalReferenceType;
(function (ExternalReferenceType) {
    ExternalReferenceType["VCS"] = "vcs";
    ExternalReferenceType["IssueTracker"] = "issue-tracker";
    ExternalReferenceType["Website"] = "website";
    ExternalReferenceType["Advisories"] = "advisories";
    ExternalReferenceType["BOM"] = "bom";
    ExternalReferenceType["MailingList"] = "mailing-list";
    ExternalReferenceType["Social"] = "social";
    ExternalReferenceType["Chat"] = "chat";
    ExternalReferenceType["Documentation"] = "documentation";
    ExternalReferenceType["Support"] = "support";
    ExternalReferenceType["SourceDistribution"] = "source-distribution";
    ExternalReferenceType["Distribution"] = "distribution";
    ExternalReferenceType["DistributionIntake"] = "distribution-intake";
    ExternalReferenceType["License"] = "license";
    ExternalReferenceType["BuildMeta"] = "build-meta";
    ExternalReferenceType["BuildSystem"] = "build-system";
    ExternalReferenceType["ReleaseNotes"] = "release-notes";
    ExternalReferenceType["SecurityContact"] = "security-contact";
    ExternalReferenceType["ModelCard"] = "model-card";
    ExternalReferenceType["Log"] = "log";
    ExternalReferenceType["Configuration"] = "configuration";
    ExternalReferenceType["Evidence"] = "evidence";
    ExternalReferenceType["Formulation"] = "formulation";
    ExternalReferenceType["Attestation"] = "attestation";
    ExternalReferenceType["ThreatModel"] = "threat-model";
    ExternalReferenceType["AdversaryModel"] = "adversary-model";
    ExternalReferenceType["RiskAssessment"] = "risk-assessment";
    ExternalReferenceType["VulnerabilityAssertion"] = "vulnerability-assertion";
    ExternalReferenceType["ExploitabilityStatement"] = "exploitability-statement";
    ExternalReferenceType["PentestReport"] = "pentest-report";
    ExternalReferenceType["StaticAnalysisReport"] = "static-analysis-report";
    ExternalReferenceType["DynamicAnalysisReport"] = "dynamic-analysis-report";
    ExternalReferenceType["RuntimeAnalysisReport"] = "runtime-analysis-report";
    ExternalReferenceType["ComponentAnalysisReport"] = "component-analysis-report";
    ExternalReferenceType["MaturityReport"] = "maturity-report";
    ExternalReferenceType["CertificationReport"] = "certification-report";
    ExternalReferenceType["CodifiedInfrastructure"] = "codified-infrastructure";
    ExternalReferenceType["QualityMetrics"] = "quality-metrics";
    ExternalReferenceType["POAM"] = "poam";
    ExternalReferenceType["ElectronicSignature"] = "electronic-signature";
    ExternalReferenceType["DigitalSignature"] = "digital-signature";
    ExternalReferenceType["RFC9116"] = "rfc-9116";
    ExternalReferenceType["Citation"] = "citation";
    ExternalReferenceType["Patent"] = "patent";
    ExternalReferenceType["PatentAssertion"] = "patent-assertion";
    ExternalReferenceType["PatentFamily"] = "patent-family";
    ExternalReferenceType["Other"] = "other";
})(ExternalReferenceType || (exports.ExternalReferenceType = ExternalReferenceType = {}));
//# sourceMappingURL=externalReferenceType.js.map

},
65065(__unused_rspack_module, exports) {

/*!
This file is part of CycloneDX JavaScript Library.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

   http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.

SPDX-License-Identifier: Apache-2.0
Copyright (c) OWASP Foundation. All Rights Reserved.
*/
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.HashAlgorithm = void 0;
var HashAlgorithm;
(function (HashAlgorithm) {
    HashAlgorithm["MD5"] = "MD5";
    HashAlgorithm["SHA-1"] = "SHA-1";
    HashAlgorithm["SHA-256"] = "SHA-256";
    HashAlgorithm["SHA-384"] = "SHA-384";
    HashAlgorithm["SHA-512"] = "SHA-512";
    HashAlgorithm["SHA3-256"] = "SHA3-256";
    HashAlgorithm["SHA3-384"] = "SHA3-384";
    HashAlgorithm["SHA3-512"] = "SHA3-512";
    HashAlgorithm["BLAKE2b-256"] = "BLAKE2b-256";
    HashAlgorithm["BLAKE2b-384"] = "BLAKE2b-384";
    HashAlgorithm["BLAKE2b-512"] = "BLAKE2b-512";
    HashAlgorithm["BLAKE3"] = "BLAKE3";
    HashAlgorithm["Streebog-256"] = "Streebog-256";
    HashAlgorithm["Streebog-512"] = "Streebog-512";
})(HashAlgorithm || (exports.HashAlgorithm = HashAlgorithm = {}));
//# sourceMappingURL=hashAlogorithm.js.map

},
19649(__unused_rspack_module, exports, __webpack_require__) {

/*!
This file is part of CycloneDX JavaScript Library.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

   http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.

SPDX-License-Identifier: Apache-2.0
Copyright (c) OWASP Foundation. All Rights Reserved.
*/
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.Vulnerability = void 0;
__exportStar(__webpack_require__(36185), exports);
__exportStar(__webpack_require__(74404), exports);
__exportStar(__webpack_require__(83714), exports);
__exportStar(__webpack_require__(78193), exports);
__exportStar(__webpack_require__(65065), exports);
__exportStar(__webpack_require__(21356), exports);
__exportStar(__webpack_require__(77086), exports);
exports.Vulnerability = __importStar(__webpack_require__(37368));
//# sourceMappingURL=index.js.map

},
21356(__unused_rspack_module, exports) {

/*!
This file is part of CycloneDX JavaScript Library.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

   http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.

SPDX-License-Identifier: Apache-2.0
Copyright (c) OWASP Foundation. All Rights Reserved.
*/
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.LicenseAcknowledgement = void 0;
var LicenseAcknowledgement;
(function (LicenseAcknowledgement) {
    LicenseAcknowledgement["Declared"] = "declared";
    LicenseAcknowledgement["Concluded"] = "concluded";
})(LicenseAcknowledgement || (exports.LicenseAcknowledgement = LicenseAcknowledgement = {}));
//# sourceMappingURL=licenseAcknowledgement.js.map

},
77086(__unused_rspack_module, exports) {

/*!
This file is part of CycloneDX JavaScript Library.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

   http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.

SPDX-License-Identifier: Apache-2.0
Copyright (c) OWASP Foundation. All Rights Reserved.
*/
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.LifecyclePhase = void 0;
var LifecyclePhase;
(function (LifecyclePhase) {
    LifecyclePhase["Design"] = "design";
    LifecyclePhase["PreBuild"] = "pre-build";
    LifecyclePhase["Build"] = "build";
    LifecyclePhase["PostBuild"] = "post-build";
    LifecyclePhase["Operations"] = "operations";
    LifecyclePhase["Discovery"] = "discovery";
    LifecyclePhase["Decommission"] = "decommission";
})(LifecyclePhase || (exports.LifecyclePhase = LifecyclePhase = {}));
//# sourceMappingURL=lifecyclePhase.js.map

},
39629(__unused_rspack_module, exports) {

/*!
This file is part of CycloneDX JavaScript Library.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

   http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.

SPDX-License-Identifier: Apache-2.0
Copyright (c) OWASP Foundation. All Rights Reserved.
*/
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.AffectStatus = void 0;
var AffectStatus;
(function (AffectStatus) {
    AffectStatus["Affected"] = "affected";
    AffectStatus["Unaffected"] = "unaffected";
    AffectStatus["Unknown"] = "unknown";
})(AffectStatus || (exports.AffectStatus = AffectStatus = {}));
//# sourceMappingURL=affectStatus.js.map

},
15288(__unused_rspack_module, exports) {

/*!
This file is part of CycloneDX JavaScript Library.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

   http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.

SPDX-License-Identifier: Apache-2.0
Copyright (c) OWASP Foundation. All Rights Reserved.
*/
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.AnalysisJustification = void 0;
var AnalysisJustification;
(function (AnalysisJustification) {
    AnalysisJustification["CodeNotPresent"] = "code_not_present";
    AnalysisJustification["CodeNotReachable"] = "code_not_reachable";
    AnalysisJustification["RequiresConfiguration"] = "requires_configuration";
    AnalysisJustification["RequiresDependency"] = "requires_dependency";
    AnalysisJustification["RequiresEnvironment"] = "requires_environment";
    AnalysisJustification["ProtectedByCompiler"] = "protected_by_compiler";
    AnalysisJustification["ProtectedAtRuntime"] = "protected_at_runtime";
    AnalysisJustification["ProtectedAtPerimeter"] = "protected_at_perimeter";
    AnalysisJustification["ProtectedByMitigatingControl"] = "protected_by_mitigating_control";
})(AnalysisJustification || (exports.AnalysisJustification = AnalysisJustification = {}));
//# sourceMappingURL=analysisJustification.js.map

},
83047(__unused_rspack_module, exports, __webpack_require__) {

/*!
This file is part of CycloneDX JavaScript Library.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

   http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.

SPDX-License-Identifier: Apache-2.0
Copyright (c) OWASP Foundation. All Rights Reserved.
*/
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.AnalysisResponseRepository = exports.AnalysisResponse = void 0;
const sortable_1 = __webpack_require__(56503);
var AnalysisResponse;
(function (AnalysisResponse) {
    AnalysisResponse["CanNotFix"] = "can_not_fix";
    AnalysisResponse["WillNotFix"] = "will_not_fix";
    AnalysisResponse["Update"] = "update";
    AnalysisResponse["Rollback"] = "rollback";
    AnalysisResponse["WorkaroundAvailable"] = "workaround_available";
})(AnalysisResponse || (exports.AnalysisResponse = AnalysisResponse = {}));
class AnalysisResponseRepository extends sortable_1.SortableStringables {
}
exports.AnalysisResponseRepository = AnalysisResponseRepository;
//# sourceMappingURL=analysisResponse.js.map

},
60515(__unused_rspack_module, exports) {

/*!
This file is part of CycloneDX JavaScript Library.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

   http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.

SPDX-License-Identifier: Apache-2.0
Copyright (c) OWASP Foundation. All Rights Reserved.
*/
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.AnalysisState = void 0;
var AnalysisState;
(function (AnalysisState) {
    AnalysisState["Resolved"] = "resolved";
    AnalysisState["ResolvedWithPedigree"] = "resolved_with_pedigree";
    AnalysisState["Exploitable"] = "exploitable";
    AnalysisState["InTriage"] = "in_triage";
    AnalysisState["FalsePositive"] = "false_positive";
    AnalysisState["NotAffected"] = "not_affected";
})(AnalysisState || (exports.AnalysisState = AnalysisState = {}));
//# sourceMappingURL=analysisState.js.map

},
37368(__unused_rspack_module, exports, __webpack_require__) {

/*!
This file is part of CycloneDX JavaScript Library.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

   http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.

SPDX-License-Identifier: Apache-2.0
Copyright (c) OWASP Foundation. All Rights Reserved.
*/
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
__exportStar(__webpack_require__(39629), exports);
__exportStar(__webpack_require__(15288), exports);
__exportStar(__webpack_require__(83047), exports);
__exportStar(__webpack_require__(60515), exports);
__exportStar(__webpack_require__(47634), exports);
__exportStar(__webpack_require__(52269), exports);
//# sourceMappingURL=index.js.map

},
47634(__unused_rspack_module, exports) {

/*!
This file is part of CycloneDX JavaScript Library.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

   http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.

SPDX-License-Identifier: Apache-2.0
Copyright (c) OWASP Foundation. All Rights Reserved.
*/
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.RatingMethod = void 0;
var RatingMethod;
(function (RatingMethod) {
    RatingMethod["CVSSv2"] = "CVSSv2";
    RatingMethod["CVSSv3"] = "CVSSv3";
    RatingMethod["CVSSv31"] = "CVSSv31";
    RatingMethod["CVSSv4"] = "CVSSv4";
    RatingMethod["OWASP"] = "OWASP";
    RatingMethod["SSVC"] = "SSVC";
    RatingMethod["Other"] = "other";
})(RatingMethod || (exports.RatingMethod = RatingMethod = {}));
//# sourceMappingURL=ratingMethod.js.map

},
52269(__unused_rspack_module, exports) {

/*!
This file is part of CycloneDX JavaScript Library.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

   http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.

SPDX-License-Identifier: Apache-2.0
Copyright (c) OWASP Foundation. All Rights Reserved.
*/
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.Severity = void 0;
var Severity;
(function (Severity) {
    Severity["Critical"] = "critical";
    Severity["High"] = "high";
    Severity["Medium"] = "medium";
    Severity["Low"] = "low";
    Severity["Info"] = "info";
    Severity["None"] = "none";
    Severity["Unknown"] = "unknown";
})(Severity || (exports.Severity = Severity = {}));
//# sourceMappingURL=severity.js.map

},
19809(__unused_rspack_module, exports, __webpack_require__) {

/*!
This file is part of CycloneDX JavaScript Library.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

   http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.

SPDX-License-Identifier: Apache-2.0
Copyright (c) OWASP Foundation. All Rights Reserved.
*/
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.Types = exports.Spec = exports.SPDX = exports.Models = exports.Enums = void 0;
exports.Enums = __importStar(__webpack_require__(19649));
exports.Models = __importStar(__webpack_require__(59431));
exports.SPDX = __importStar(__webpack_require__(97517));
exports.Spec = __importStar(__webpack_require__(32898));
exports.Types = __importStar(__webpack_require__(60390));
//# sourceMappingURL=index.common.js.map

},
17412(__unused_rspack_module, exports, __webpack_require__) {

/*!
This file is part of CycloneDX JavaScript Library.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

   http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.

SPDX-License-Identifier: Apache-2.0
Copyright (c) OWASP Foundation. All Rights Reserved.
*/
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports._Resources = exports.Validation = exports.Serialize = exports.Contrib = void 0;
__exportStar(__webpack_require__(19809), exports);
exports.Contrib = __importStar(__webpack_require__(56314));
exports.Serialize = __importStar(__webpack_require__(93947));
exports.Validation = __importStar(__webpack_require__(42154));
exports._Resources = __importStar(__webpack_require__(9471));
//# sourceMappingURL=index.node.js.map

},
25554(__unused_rspack_module, exports) {

/*!
This file is part of CycloneDX JavaScript Library.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

   http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.

SPDX-License-Identifier: Apache-2.0
Copyright (c) OWASP Foundation. All Rights Reserved.
*/
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.Attachment = void 0;
class Attachment {
    contentType;
    content;
    encoding;
    constructor(content, op = {}) {
        this.contentType = op.contentType;
        this.content = content;
        this.encoding = op.encoding;
    }
}
exports.Attachment = Attachment;
//# sourceMappingURL=attachment.js.map

},
7881(__unused_rspack_module, exports, __webpack_require__) {

/*!
This file is part of CycloneDX JavaScript Library.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

   http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.

SPDX-License-Identifier: Apache-2.0
Copyright (c) OWASP Foundation. All Rights Reserved.
*/
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.Bom = void 0;
const integer_1 = __webpack_require__(88428);
const component_1 = __webpack_require__(93520);
const metadata_1 = __webpack_require__(57626);
const service_1 = __webpack_require__(28076);
const vulnerability_1 = __webpack_require__(75096);
class Bom {
    metadata;
    components;
    services;
    vulnerabilities;
    #version = 1;
    #serialNumber;
    constructor(op = {}) {
        this.metadata = op.metadata ?? new metadata_1.Metadata();
        this.components = op.components ?? new component_1.ComponentRepository();
        this.services = op.services ?? new service_1.ServiceRepository();
        this.version = op.version ?? this.version;
        this.vulnerabilities = op.vulnerabilities ?? new vulnerability_1.VulnerabilityRepository();
        this.serialNumber = op.serialNumber;
    }
    get version() {
        return this.#version;
    }
    set version(value) {
        if (!(0, integer_1.isPositiveInteger)(value)) {
            throw new TypeError('Not PositiveInteger');
        }
        this.#version = value;
    }
    get serialNumber() {
        return this.#serialNumber;
    }
    set serialNumber(value) {
        this.#serialNumber = value === ''
            ? undefined
            : value;
    }
}
exports.Bom = Bom;
//# sourceMappingURL=bom.js.map

},
15649(__unused_rspack_module, exports) {

/*!
This file is part of CycloneDX JavaScript Library.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

   http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.

SPDX-License-Identifier: Apache-2.0
Copyright (c) OWASP Foundation. All Rights Reserved.
*/
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.BomLinkElement = exports.BomLinkDocument = void 0;
class BomLinkBase {
    #value;
    constructor(value) {
        this.value = value;
    }
    get value() {
        return this.#value;
    }
    set value(value) {
        if (!this._isValid(value)) {
            throw new RangeError('invalid value');
        }
        this.#value = value;
    }
    compare(other) {
        return this.toString().localeCompare(other.toString());
    }
    toString() {
        return this.value;
    }
}
class BomLinkDocument extends BomLinkBase {
    static #pattern = /^urn:cdx:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[1-9][0-9]*$/;
    static isValid(value) {
        return typeof value === 'string' &&
            this.#pattern.test(value);
    }
    _isValid(value) {
        return BomLinkDocument.isValid(value);
    }
}
exports.BomLinkDocument = BomLinkDocument;
class BomLinkElement extends BomLinkBase {
    static #pattern = /^urn:cdx:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[1-9][0-9]*#.+$/;
    static isValid(value) {
        return typeof value === 'string' &&
            this.#pattern.test(value);
    }
    _isValid(value) {
        return BomLinkElement.isValid(value);
    }
}
exports.BomLinkElement = BomLinkElement;
//# sourceMappingURL=bomLink.js.map

},
88052(__unused_rspack_module, exports) {

/*!
This file is part of CycloneDX JavaScript Library.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

   http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.

SPDX-License-Identifier: Apache-2.0
Copyright (c) OWASP Foundation. All Rights Reserved.
*/
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.BomRefRepository = exports.BomRef = void 0;
class BomRef {
    value;
    constructor(value) {
        this.value = value;
    }
    compare(other) {
        return this.toString().localeCompare(other.toString());
    }
    toString() {
        return this.value ?? '';
    }
}
exports.BomRef = BomRef;
class BomRefRepository extends Set {
}
exports.BomRefRepository = BomRefRepository;
//# sourceMappingURL=bomRef.js.map

},
93520(__unused_rspack_module, exports, __webpack_require__) {

/*!
This file is part of CycloneDX JavaScript Library.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

   http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.

SPDX-License-Identifier: Apache-2.0
Copyright (c) OWASP Foundation. All Rights Reserved.
*/
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.ComponentEvidence = exports.ComponentRepository = exports.Component = void 0;
const sortable_1 = __webpack_require__(56503);
const tree_1 = __webpack_require__(39971);
const cpe_1 = __webpack_require__(71984);
const bomRef_1 = __webpack_require__(88052);
const copyright_1 = __webpack_require__(84866);
const externalReference_1 = __webpack_require__(22383);
const hash_1 = __webpack_require__(60643);
const license_1 = __webpack_require__(81884);
const property_1 = __webpack_require__(30246);
class Component {
    type;
    name;
    author;
    copyright;
    description;
    externalReferences;
    group;
    hashes;
    licenses;
    publisher;
    purl;
    scope;
    supplier;
    swid;
    version;
    components;
    properties;
    evidence;
    #bomRef;
    #cpe;
    dependencies;
    constructor(type, name, op = {}) {
        this.#bomRef = new bomRef_1.BomRef(op.bomRef);
        this.type = type;
        this.name = name;
        this.supplier = op.supplier;
        this.author = op.author;
        this.copyright = op.copyright;
        this.externalReferences = op.externalReferences ?? new externalReference_1.ExternalReferenceRepository();
        this.group = op.group;
        this.hashes = op.hashes ?? new hash_1.HashDictionary();
        this.licenses = op.licenses ?? new license_1.LicenseRepository();
        this.publisher = op.publisher;
        this.purl = op.purl;
        this.scope = op.scope;
        this.swid = op.swid;
        this.version = op.version;
        this.description = op.description;
        this.components = op.components ?? new ComponentRepository();
        this.cpe = op.cpe;
        this.properties = op.properties ?? new property_1.PropertyRepository();
        this.evidence = op.evidence;
        this.dependencies = op.dependencies ?? new bomRef_1.BomRefRepository();
    }
    get bomRef() {
        return this.#bomRef;
    }
    get cpe() {
        return this.#cpe;
    }
    set cpe(value) {
        if (value !== undefined && !(0, cpe_1.isCPE)(value)) {
            throw new TypeError('Not CPE nor undefined');
        }
        this.#cpe = value;
    }
    compare(other) {
        const bomRefCompare = this.bomRef.compare(other.bomRef);
        if (bomRefCompare !== 0) {
            return bomRefCompare;
        }
        if (this.purl !== undefined && other.purl !== undefined) {
            return this.purl.localeCompare(other.purl);
        }
        if (this.#cpe !== undefined && other.#cpe !== undefined) {
            return this.#cpe.localeCompare(other.#cpe);
        }
        return (this.group ?? '').localeCompare(other.group ?? '') ||
            this.name.localeCompare(other.name) ||
            (this.version ?? '').localeCompare(other.version ?? '');
    }
}
exports.Component = Component;
class ComponentRepository extends sortable_1.SortableComparables {
    *[tree_1.treeIteratorSymbol]() {
        for (const component of this) {
            yield component;
            yield* component.components[tree_1.treeIteratorSymbol]();
        }
    }
}
exports.ComponentRepository = ComponentRepository;
class ComponentEvidence {
    licenses;
    copyright;
    constructor(op = {}) {
        this.licenses = op.licenses ?? new license_1.LicenseRepository();
        this.copyright = op.copyright ?? new copyright_1.CopyrightRepository();
    }
}
exports.ComponentEvidence = ComponentEvidence;
//# sourceMappingURL=component.js.map

},
84866(__unused_rspack_module, exports, __webpack_require__) {

/*!
This file is part of CycloneDX JavaScript Library.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

   http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.

SPDX-License-Identifier: Apache-2.0
Copyright (c) OWASP Foundation. All Rights Reserved.
*/
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.CopyrightRepository = void 0;
const sortable_1 = __webpack_require__(56503);
class CopyrightRepository extends sortable_1.SortableStringables {
}
exports.CopyrightRepository = CopyrightRepository;
//# sourceMappingURL=copyright.js.map

},
22383(__unused_rspack_module, exports, __webpack_require__) {

/*!
This file is part of CycloneDX JavaScript Library.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

   http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.

SPDX-License-Identifier: Apache-2.0
Copyright (c) OWASP Foundation. All Rights Reserved.
*/
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.ExternalReferenceRepository = exports.ExternalReference = void 0;
const sortable_1 = __webpack_require__(56503);
const hash_1 = __webpack_require__(60643);
class ExternalReference {
    url;
    type;
    hashes;
    comment;
    constructor(url, type, op = {}) {
        this.url = url;
        this.type = type;
        this.hashes = op.hashes ?? new hash_1.HashDictionary();
        this.comment = op.comment;
    }
    compare(other) {
        return this.type.localeCompare(other.type) ||
            this.url.toString().localeCompare(other.url.toString());
    }
}
exports.ExternalReference = ExternalReference;
class ExternalReferenceRepository extends sortable_1.SortableComparables {
}
exports.ExternalReferenceRepository = ExternalReferenceRepository;
//# sourceMappingURL=externalReference.js.map

},
60643(__unused_rspack_module, exports) {

/*!
This file is part of CycloneDX JavaScript Library.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

   http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.

SPDX-License-Identifier: Apache-2.0
Copyright (c) OWASP Foundation. All Rights Reserved.
*/
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.HashDictionary = void 0;
class HashDictionary extends Map {
    static #compareItems([a1, c1], [a2, c2]) {
        return a1.localeCompare(a2) ||
            c1.localeCompare(c2);
    }
    sorted() {
        return Array.from(this.entries()).sort(HashDictionary.#compareItems);
    }
}
exports.HashDictionary = HashDictionary;
//# sourceMappingURL=hash.js.map

},
59431(__unused_rspack_module, exports, __webpack_require__) {

/*!
This file is part of CycloneDX JavaScript Library.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

   http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.

SPDX-License-Identifier: Apache-2.0
Copyright (c) OWASP Foundation. All Rights Reserved.
*/
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.Vulnerability = void 0;
__exportStar(__webpack_require__(25554), exports);
__exportStar(__webpack_require__(7881), exports);
__exportStar(__webpack_require__(15649), exports);
__exportStar(__webpack_require__(88052), exports);
__exportStar(__webpack_require__(93520), exports);
__exportStar(__webpack_require__(84866), exports);
__exportStar(__webpack_require__(22383), exports);
__exportStar(__webpack_require__(60643), exports);
__exportStar(__webpack_require__(81884), exports);
__exportStar(__webpack_require__(95239), exports);
__exportStar(__webpack_require__(57626), exports);
__exportStar(__webpack_require__(50049), exports);
__exportStar(__webpack_require__(50926), exports);
__exportStar(__webpack_require__(30246), exports);
__exportStar(__webpack_require__(28076), exports);
__exportStar(__webpack_require__(50824), exports);
__exportStar(__webpack_require__(62417), exports);
exports.Vulnerability = __importStar(__webpack_require__(786));
//# sourceMappingURL=index.js.map

},
81884(__unused_rspack_module, exports, __webpack_require__) {

/*!
This file is part of CycloneDX JavaScript Library.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

   http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.

SPDX-License-Identifier: Apache-2.0
Copyright (c) OWASP Foundation. All Rights Reserved.
*/
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.LicenseRepository = exports.SpdxLicense = exports.NamedLicense = exports.LicenseExpression = void 0;
const property_1 = __webpack_require__(30246);
class LicenseExpression {
    #expression;
    acknowledgement;
    constructor(expression) {
        this.expression = expression;
    }
    get expression() {
        return this.#expression;
    }
    set expression(value) {
        if (value === '') {
            throw new RangeError('value is empty string');
        }
        this.#expression = value;
    }
    compare(other) {
        return this.#expression.localeCompare(other.#expression);
    }
}
exports.LicenseExpression = LicenseExpression;
class DisjunctiveLicenseBase {
    acknowledgement;
    text;
    #url;
    properties;
    constructor(op = {}) {
        this.acknowledgement = op.acknowledgement;
        this.text = op.text;
        this.url = op.url;
        this.properties = op.properties ?? new property_1.PropertyRepository();
    }
    get url() {
        return this.#url;
    }
    set url(value) {
        this.#url = value === ''
            ? undefined
            : value;
    }
}
class NamedLicense extends DisjunctiveLicenseBase {
    name;
    constructor(name, op = {}) {
        super(op);
        this.name = name;
    }
    compare(other) {
        return this.name.localeCompare(other.name);
    }
}
exports.NamedLicense = NamedLicense;
class SpdxLicense extends DisjunctiveLicenseBase {
    #id;
    constructor(id, op = {}) {
        super(op);
        this.id = id;
    }
    get id() {
        return this.#id;
    }
    set id(value) {
        if (value === '') {
            throw new RangeError('value is empty string');
        }
        this.#id = value;
    }
    compare(other) {
        return this.#id.localeCompare(other.#id);
    }
}
exports.SpdxLicense = SpdxLicense;
class LicenseRepository extends Set {
    static #compareItems(a, b) {
        if (a.constructor === b.constructor) {
            return a.compare(b);
        }
        return a.constructor.name.localeCompare(b.constructor.name);
    }
    sorted() {
        return Array.from(this).sort(LicenseRepository.#compareItems);
    }
}
exports.LicenseRepository = LicenseRepository;
//# sourceMappingURL=license.js.map

},
95239(__unused_rspack_module, exports) {

/*!
This file is part of CycloneDX JavaScript Library.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

   http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.

SPDX-License-Identifier: Apache-2.0
Copyright (c) OWASP Foundation. All Rights Reserved.
*/
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.LifecycleRepository = exports.NamedLifecycle = void 0;
class NamedLifecycle {
    name;
    description;
    constructor(name, op = {}) {
        this.name = name;
        this.description = op.description;
    }
    compare(other) {
        return this.name.localeCompare(other.name);
    }
}
exports.NamedLifecycle = NamedLifecycle;
class LifecycleRepository extends Set {
    static #compareItems(a, b) {
        if (a.constructor === b.constructor) {
            return a instanceof NamedLifecycle
                ? a.compare(b)
                : a.localeCompare(b);
        }
        return a.constructor.name.localeCompare(b.constructor.name);
    }
    sorted() {
        return Array.from(this).sort(LifecycleRepository.#compareItems);
    }
}
exports.LifecycleRepository = LifecycleRepository;
//# sourceMappingURL=lifecycle.js.map

},
57626(__unused_rspack_module, exports, __webpack_require__) {

/*!
This file is part of CycloneDX JavaScript Library.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

   http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.

SPDX-License-Identifier: Apache-2.0
Copyright (c) OWASP Foundation. All Rights Reserved.
*/
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.Metadata = void 0;
const license_1 = __webpack_require__(81884);
const lifecycle_1 = __webpack_require__(95239);
const organizationalContact_1 = __webpack_require__(50049);
const property_1 = __webpack_require__(30246);
const tool_1 = __webpack_require__(62417);
class Metadata {
    timestamp;
    lifecycles;
    tools;
    authors;
    component;
    manufacture;
    supplier;
    licenses;
    properties;
    constructor(op = {}) {
        this.timestamp = op.timestamp;
        this.lifecycles = op.lifecycles ?? new lifecycle_1.LifecycleRepository();
        this.tools = op.tools ?? new tool_1.Tools();
        this.authors = op.authors ?? new organizationalContact_1.OrganizationalContactRepository();
        this.component = op.component;
        this.manufacture = op.manufacture;
        this.supplier = op.supplier;
        this.licenses = op.licenses ?? new license_1.LicenseRepository();
        this.properties = op.properties ?? new property_1.PropertyRepository();
    }
}
exports.Metadata = Metadata;
//# sourceMappingURL=metadata.js.map

},
50049(__unused_rspack_module, exports, __webpack_require__) {

/*!
This file is part of CycloneDX JavaScript Library.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

   http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.

SPDX-License-Identifier: Apache-2.0
Copyright (c) OWASP Foundation. All Rights Reserved.
*/
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.OrganizationalContactRepository = exports.OrganizationalContact = void 0;
const sortable_1 = __webpack_require__(56503);
class OrganizationalContact {
    name;
    email;
    phone;
    constructor(op = {}) {
        this.name = op.name;
        this.email = op.email;
        this.phone = op.phone;
    }
    compare(other) {
        return (this.name ?? '').localeCompare(other.name ?? '') ||
            (this.email ?? '').localeCompare(other.email ?? '') ||
            (this.phone ?? '').localeCompare(other.phone ?? '');
    }
}
exports.OrganizationalContact = OrganizationalContact;
class OrganizationalContactRepository extends sortable_1.SortableComparables {
}
exports.OrganizationalContactRepository = OrganizationalContactRepository;
//# sourceMappingURL=organizationalContact.js.map

},
50926(__unused_rspack_module, exports, __webpack_require__) {

/*!
This file is part of CycloneDX JavaScript Library.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

   http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.

SPDX-License-Identifier: Apache-2.0
Copyright (c) OWASP Foundation. All Rights Reserved.
*/
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.OrganizationalEntityRepository = exports.OrganizationalEntity = void 0;
const sortable_1 = __webpack_require__(56503);
const organizationalContact_1 = __webpack_require__(50049);
class OrganizationalEntity {
    name;
    url;
    contact;
    constructor(op = {}) {
        this.name = op.name;
        this.url = op.url ?? new Set();
        this.contact = op.contact ?? new organizationalContact_1.OrganizationalContactRepository();
    }
    compare(other) {
        return (this.name ?? '').localeCompare(other.name ?? '') ||
            this.contact.compare(other.contact) ||
            (new sortable_1.SortableStringables(this.url)).compare(new sortable_1.SortableStringables(other.url));
    }
}
exports.OrganizationalEntity = OrganizationalEntity;
class OrganizationalEntityRepository extends sortable_1.SortableComparables {
}
exports.OrganizationalEntityRepository = OrganizationalEntityRepository;
//# sourceMappingURL=organizationalEntity.js.map

},
30246(__unused_rspack_module, exports, __webpack_require__) {

/*!
This file is part of CycloneDX JavaScript Library.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

   http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.

SPDX-License-Identifier: Apache-2.0
Copyright (c) OWASP Foundation. All Rights Reserved.
*/
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.PropertyRepository = exports.Property = void 0;
const sortable_1 = __webpack_require__(56503);
class Property {
    name;
    value;
    constructor(name, value) {
        this.name = name;
        this.value = value;
    }
    compare(other) {
        return this.name.localeCompare(other.name) ||
            this.value.localeCompare(other.value);
    }
}
exports.Property = Property;
class PropertyRepository extends sortable_1.SortableComparables {
}
exports.PropertyRepository = PropertyRepository;
//# sourceMappingURL=property.js.map

},
28076(__unused_rspack_module, exports, __webpack_require__) {

/*!
This file is part of CycloneDX JavaScript Library.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

   http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.

SPDX-License-Identifier: Apache-2.0
Copyright (c) OWASP Foundation. All Rights Reserved.
*/
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.ServiceRepository = exports.Service = void 0;
const sortable_1 = __webpack_require__(56503);
const tree_1 = __webpack_require__(39971);
const bomRef_1 = __webpack_require__(88052);
const externalReference_1 = __webpack_require__(22383);
const license_1 = __webpack_require__(81884);
const property_1 = __webpack_require__(30246);
class Service {
    provider;
    group;
    name;
    version;
    description;
    licenses;
    externalReferences;
    services;
    properties;
    #bomRef;
    dependencies;
    constructor(name, op = {}) {
        this.#bomRef = new bomRef_1.BomRef(op.bomRef);
        this.provider = op.provider;
        this.group = op.group;
        this.name = name;
        this.version = op.version;
        this.description = op.description;
        this.licenses = op.licenses ?? new license_1.LicenseRepository();
        this.externalReferences = op.externalReferences ?? new externalReference_1.ExternalReferenceRepository();
        this.services = op.services ?? new ServiceRepository();
        this.properties = op.properties ?? new property_1.PropertyRepository();
        this.dependencies = op.dependencies ?? new bomRef_1.BomRefRepository();
    }
    get bomRef() {
        return this.#bomRef;
    }
    compare(other) {
        const bomRefCompare = this.bomRef.compare(other.bomRef);
        if (bomRefCompare !== 0) {
            return bomRefCompare;
        }
        return (this.group ?? '').localeCompare(other.group ?? '') ||
            this.name.localeCompare(other.name) ||
            (this.version ?? '').localeCompare(other.version ?? '');
    }
}
exports.Service = Service;
class ServiceRepository extends sortable_1.SortableComparables {
    *[tree_1.treeIteratorSymbol]() {
        for (const service of this) {
            yield service;
            yield* service.services[tree_1.treeIteratorSymbol]();
        }
    }
}
exports.ServiceRepository = ServiceRepository;
//# sourceMappingURL=service.js.map

},
50824(__unused_rspack_module, exports, __webpack_require__) {

/*!
This file is part of CycloneDX JavaScript Library.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

   http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.

SPDX-License-Identifier: Apache-2.0
Copyright (c) OWASP Foundation. All Rights Reserved.
*/
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.SWID = void 0;
const integer_1 = __webpack_require__(88428);
class SWID {
    tagId;
    name;
    version;
    patch;
    text;
    url;
    #tagVersion;
    constructor(tagId, name, op = {}) {
        this.tagId = tagId;
        this.name = name;
        this.version = op.version;
        this.patch = op.patch;
        this.text = op.text;
        this.url = op.url;
        this.tagVersion = op.tagVersion;
    }
    get tagVersion() {
        return this.#tagVersion;
    }
    set tagVersion(value) {
        if (value !== undefined && !(0, integer_1.isNonNegativeInteger)(value)) {
            throw new TypeError('Not NonNegativeInteger nor undefined');
        }
        this.#tagVersion = value;
    }
}
exports.SWID = SWID;
//# sourceMappingURL=swid.js.map

},
62417(__unused_rspack_module, exports, __webpack_require__) {

/*!
This file is part of CycloneDX JavaScript Library.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

   http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.

SPDX-License-Identifier: Apache-2.0
Copyright (c) OWASP Foundation. All Rights Reserved.
*/
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.Tools = exports.ToolRepository = exports.Tool = void 0;
const sortable_1 = __webpack_require__(56503);
const component_1 = __webpack_require__(93520);
const externalReference_1 = __webpack_require__(22383);
const hash_1 = __webpack_require__(60643);
const service_1 = __webpack_require__(28076);
class Tool {
    vendor;
    name;
    version;
    hashes;
    externalReferences;
    constructor(op = {}) {
        this.vendor = op.vendor;
        this.name = op.name;
        this.version = op.version;
        this.hashes = op.hashes ?? new hash_1.HashDictionary();
        this.externalReferences = op.externalReferences ?? new externalReference_1.ExternalReferenceRepository();
    }
    compare(other) {
        return (this.vendor ?? '').localeCompare(other.vendor ?? '') ||
            (this.name ?? '').localeCompare(other.name ?? '') ||
            (this.version ?? '').localeCompare(other.version ?? '');
    }
    static fromComponent(component) {
        return new Tool({
            vendor: component.group,
            name: component.name,
            version: component.version,
            hashes: component.hashes,
            externalReferences: component.externalReferences
        });
    }
    static fromService(service) {
        return new Tool({
            vendor: service.group,
            name: service.name,
            version: service.version,
            externalReferences: service.externalReferences
        });
    }
}
exports.Tool = Tool;
class ToolRepository extends sortable_1.SortableComparables {
}
exports.ToolRepository = ToolRepository;
class Tools {
    components;
    services;
    tools;
    constructor(op = {}) {
        this.components = op.components ?? new component_1.ComponentRepository();
        this.services = op.services ?? new service_1.ServiceRepository();
        this.tools = op.tools ?? new ToolRepository();
    }
    get size() {
        return this.components.size
            + this.services.size
            + this.tools.size;
    }
}
exports.Tools = Tools;
//# sourceMappingURL=tool.js.map

},
76243(__unused_rspack_module, exports, __webpack_require__) {

/*!
This file is part of CycloneDX JavaScript Library.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

   http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.

SPDX-License-Identifier: Apache-2.0
Copyright (c) OWASP Foundation. All Rights Reserved.
*/
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.AdvisoryRepository = exports.Advisory = void 0;
const sortable_1 = __webpack_require__(56503);
class Advisory {
    title;
    url;
    constructor(url, op = {}) {
        this.url = url;
        this.title = op.title;
    }
    compare(other) {
        return this.url.toString().localeCompare(other.url.toString()) ||
            (this.title ?? '').localeCompare(other.title ?? '');
    }
}
exports.Advisory = Advisory;
class AdvisoryRepository extends sortable_1.SortableComparables {
}
exports.AdvisoryRepository = AdvisoryRepository;
//# sourceMappingURL=advisory.js.map

},
1429(__unused_rspack_module, exports, __webpack_require__) {

/*!
This file is part of CycloneDX JavaScript Library.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

   http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.

SPDX-License-Identifier: Apache-2.0
Copyright (c) OWASP Foundation. All Rights Reserved.
*/
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.AffectedVersionRepository = exports.AffectedVersionRange = exports.AffectedSingleVersion = exports.AffectRepository = exports.Affect = void 0;
const sortable_1 = __webpack_require__(56503);
class Affect {
    ref;
    versions;
    constructor(ref, op = {}) {
        this.ref = ref;
        this.versions = op.versions ?? new AffectedVersionRepository();
    }
    compare(other) {
        return this.ref.compare(other.ref) ||
            this.versions.compare(other.versions);
    }
}
exports.Affect = Affect;
class AffectRepository extends sortable_1.SortableComparables {
}
exports.AffectRepository = AffectRepository;
class AffectedSingleVersion {
    version;
    status;
    constructor(version, op = {}) {
        this.version = version;
        this.status = op.status;
    }
    compare(other) {
        return (this.version).localeCompare(other.version) ||
            (this.status ?? '').localeCompare(other.status ?? '');
    }
}
exports.AffectedSingleVersion = AffectedSingleVersion;
class AffectedVersionRange {
    range;
    status;
    constructor(range, op = {}) {
        this.range = range;
        this.status = op.status;
    }
    compare(other) {
        return (this.range).localeCompare(other.range) ||
            (this.status ?? '').localeCompare(other.status ?? '');
    }
}
exports.AffectedVersionRange = AffectedVersionRange;
class AffectedVersionRepository extends sortable_1.SortableComparables {
}
exports.AffectedVersionRepository = AffectedVersionRepository;
//# sourceMappingURL=affect.js.map

},
67014(__unused_rspack_module, exports, __webpack_require__) {

/*!
This file is part of CycloneDX JavaScript Library.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

   http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.

SPDX-License-Identifier: Apache-2.0
Copyright (c) OWASP Foundation. All Rights Reserved.
*/
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.Analysis = void 0;
const analysisResponse_1 = __webpack_require__(83047);
class Analysis {
    state;
    justification;
    response;
    detail;
    constructor(op = {}) {
        this.state = op.state;
        this.justification = op.justification;
        this.response = op.response ?? new analysisResponse_1.AnalysisResponseRepository();
        this.detail = op.detail;
    }
}
exports.Analysis = Analysis;
//# sourceMappingURL=analysis.js.map

},
29888(__unused_rspack_module, exports, __webpack_require__) {

/*!
This file is part of CycloneDX JavaScript Library.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

   http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.

SPDX-License-Identifier: Apache-2.0
Copyright (c) OWASP Foundation. All Rights Reserved.
*/
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.Credits = void 0;
const organizationalContact_1 = __webpack_require__(50049);
const organizationalEntity_1 = __webpack_require__(50926);
class Credits {
    organizations;
    individuals;
    constructor(op = {}) {
        this.organizations = op.organizations ?? new organizationalEntity_1.OrganizationalEntityRepository();
        this.individuals = op.individuals ?? new organizationalContact_1.OrganizationalContactRepository();
    }
}
exports.Credits = Credits;
//# sourceMappingURL=credits.js.map

},
786(__unused_rspack_module, exports, __webpack_require__) {

/*!
This file is part of CycloneDX JavaScript Library.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

   http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.

SPDX-License-Identifier: Apache-2.0
Copyright (c) OWASP Foundation. All Rights Reserved.
*/
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
__exportStar(__webpack_require__(76243), exports);
__exportStar(__webpack_require__(1429), exports);
__exportStar(__webpack_require__(67014), exports);
__exportStar(__webpack_require__(29888), exports);
__exportStar(__webpack_require__(47861), exports);
__exportStar(__webpack_require__(30303), exports);
__exportStar(__webpack_require__(78729), exports);
__exportStar(__webpack_require__(75096), exports);
//# sourceMappingURL=index.js.map

},
47861(__unused_rspack_module, exports, __webpack_require__) {

/*!
This file is part of CycloneDX JavaScript Library.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

   http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.

SPDX-License-Identifier: Apache-2.0
Copyright (c) OWASP Foundation. All Rights Reserved.
*/
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.RatingRepository = exports.Rating = void 0;
const sortable_1 = __webpack_require__(56503);
class Rating {
    source;
    score;
    severity;
    method;
    vector;
    justification;
    constructor(op = {}) {
        this.source = op.source;
        this.score = op.score;
        this.severity = op.severity;
        this.method = op.method;
        this.vector = op.vector;
        this.justification = op.justification;
    }
    compare(other) {
        return ((this.score ?? 0) - (other.score ?? 0)) ||
            (this.vector ?? '').localeCompare(other.vector ?? '') ||
            (this.justification ?? '').localeCompare(other.justification ?? '') ||
            (this.severity ?? '').localeCompare(other.severity ?? '') ||
            (this.method ?? '').localeCompare(other.method ?? '') ||
            (this.source && other.source ? this.source.compare(other.source) : 0);
    }
}
exports.Rating = Rating;
class RatingRepository extends sortable_1.SortableComparables {
}
exports.RatingRepository = RatingRepository;
//# sourceMappingURL=rating.js.map

},
30303(__unused_rspack_module, exports, __webpack_require__) {

/*!
This file is part of CycloneDX JavaScript Library.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

   http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.

SPDX-License-Identifier: Apache-2.0
Copyright (c) OWASP Foundation. All Rights Reserved.
*/
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.ReferenceRepository = exports.Reference = void 0;
const sortable_1 = __webpack_require__(56503);
class Reference {
    id;
    source;
    constructor(id, source) {
        this.id = id;
        this.source = source;
    }
    compare(other) {
        return this.id.localeCompare(other.id) ||
            this.source.compare(other.source);
    }
}
exports.Reference = Reference;
class ReferenceRepository extends sortable_1.SortableComparables {
}
exports.ReferenceRepository = ReferenceRepository;
//# sourceMappingURL=reference.js.map

},
78729(__unused_rspack_module, exports) {

/*!
This file is part of CycloneDX JavaScript Library.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

   http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.

SPDX-License-Identifier: Apache-2.0
Copyright (c) OWASP Foundation. All Rights Reserved.
*/
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.Source = void 0;
class Source {
    name;
    url;
    constructor(op = {}) {
        this.name = op.name;
        this.url = op.url;
    }
    compare(other) {
        return (this.url?.toString() ?? '').localeCompare(other.url?.toString() ?? '') ||
            (this.name ?? '').localeCompare(other.name ?? '');
    }
}
exports.Source = Source;
//# sourceMappingURL=source.js.map

},
75096(__unused_rspack_module, exports, __webpack_require__) {

/*!
This file is part of CycloneDX JavaScript Library.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

   http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.

SPDX-License-Identifier: Apache-2.0
Copyright (c) OWASP Foundation. All Rights Reserved.
*/
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.VulnerabilityRepository = exports.Vulnerability = void 0;
const sortable_1 = __webpack_require__(56503);
const cwe_1 = __webpack_require__(57091);
const bomRef_1 = __webpack_require__(88052);
const property_1 = __webpack_require__(30246);
const tool_1 = __webpack_require__(62417);
const advisory_1 = __webpack_require__(76243);
const affect_1 = __webpack_require__(1429);
const rating_1 = __webpack_require__(47861);
const reference_1 = __webpack_require__(30303);
class Vulnerability {
    #bomRef;
    id;
    source;
    references;
    ratings;
    cwes;
    description;
    detail;
    recommendation;
    advisories;
    created;
    published;
    updated;
    credits;
    tools;
    analysis;
    affects;
    properties;
    constructor(op = {}) {
        this.#bomRef = new bomRef_1.BomRef(op.bomRef);
        this.id = op.id;
        this.source = op.source;
        this.references = op.references ?? new reference_1.ReferenceRepository();
        this.ratings = op.ratings ?? new rating_1.RatingRepository();
        this.cwes = op.cwes ?? new cwe_1.CweRepository();
        this.description = op.description;
        this.detail = op.detail;
        this.recommendation = op.recommendation;
        this.advisories = op.advisories ?? new advisory_1.AdvisoryRepository();
        this.created = op.created;
        this.published = op.published;
        this.updated = op.updated;
        this.credits = op.credits;
        this.tools = op.tools ?? new tool_1.Tools();
        this.analysis = op.analysis;
        this.affects = op.affects ?? new affect_1.AffectRepository();
        this.properties = op.properties ?? new property_1.PropertyRepository();
    }
    get bomRef() {
        return this.#bomRef;
    }
    compare(other) {
        const bomRefCompare = this.bomRef.compare(other.bomRef);
        if (bomRefCompare !== 0) {
            return bomRefCompare;
        }
        return (this.id ?? '').localeCompare(other.id ?? '') ||
            (this.created?.getTime() ?? 0) - (other.created?.getTime() ?? 0) ||
            (this.published?.getTime() ?? 0) - (other.published?.getTime() ?? 0) ||
            (this.updated?.getTime() ?? 0) - (other.updated?.getTime() ?? 0) ||
            this.ratings.compare(other.ratings) ||
            this.cwes.compare(other.cwes) ||
            (this.description ?? '').localeCompare(other.description ?? '') ||
            (this.detail ?? '').localeCompare(other.detail ?? '') ||
            (this.recommendation ?? '').localeCompare(other.recommendation ?? '') ||
            (this.source && other.source ? this.source.compare(other.source) : 0) ||
            this.properties.compare(other.properties);
    }
}
exports.Vulnerability = Vulnerability;
class VulnerabilityRepository extends sortable_1.SortableComparables {
}
exports.VulnerabilityRepository = VulnerabilityRepository;
//# sourceMappingURL=vulnerability.js.map

},
9471(__unused_rspack_module, exports, __webpack_require__) {

/*!
This file is part of CycloneDX JavaScript Library.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

   http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.

SPDX-License-Identifier: Apache-2.0
Copyright (c) OWASP Foundation. All Rights Reserved.
*/
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.FILES = exports.SCHEMA_ROOT = exports.ROOT = void 0;
const node_path_1 = __webpack_require__(76760);
const enums_1 = __webpack_require__(45928);
exports.ROOT = (0, node_path_1.resolve)(__dirname, '..', 'res');
exports.SCHEMA_ROOT = (0, node_path_1.resolve)(exports.ROOT, 'schema');
exports.FILES = Object.freeze({
    CDX: Object.freeze({
        XML_SCHEMA: Object.freeze({
            [enums_1.Version.v1dot7]: (0, node_path_1.resolve)(exports.SCHEMA_ROOT, 'bom-1.7.SNAPSHOT.xsd'),
            [enums_1.Version.v1dot6]: (0, node_path_1.resolve)(exports.SCHEMA_ROOT, 'bom-1.6.SNAPSHOT.xsd'),
            [enums_1.Version.v1dot5]: (0, node_path_1.resolve)(exports.SCHEMA_ROOT, 'bom-1.5.SNAPSHOT.xsd'),
            [enums_1.Version.v1dot4]: (0, node_path_1.resolve)(exports.SCHEMA_ROOT, 'bom-1.4.SNAPSHOT.xsd'),
            [enums_1.Version.v1dot3]: (0, node_path_1.resolve)(exports.SCHEMA_ROOT, 'bom-1.3.SNAPSHOT.xsd'),
            [enums_1.Version.v1dot2]: (0, node_path_1.resolve)(exports.SCHEMA_ROOT, 'bom-1.2.SNAPSHOT.xsd'),
            [enums_1.Version.v1dot1]: (0, node_path_1.resolve)(exports.SCHEMA_ROOT, 'bom-1.1.SNAPSHOT.xsd'),
            [enums_1.Version.v1dot0]: (0, node_path_1.resolve)(exports.SCHEMA_ROOT, 'bom-1.0.SNAPSHOT.xsd')
        }),
        JSON_SCHEMA: Object.freeze({
            [enums_1.Version.v1dot7]: (0, node_path_1.resolve)(exports.SCHEMA_ROOT, 'bom-1.7.SNAPSHOT.schema.json'),
            [enums_1.Version.v1dot6]: (0, node_path_1.resolve)(exports.SCHEMA_ROOT, 'bom-1.6.SNAPSHOT.schema.json'),
            [enums_1.Version.v1dot5]: (0, node_path_1.resolve)(exports.SCHEMA_ROOT, 'bom-1.5.SNAPSHOT.schema.json'),
            [enums_1.Version.v1dot4]: (0, node_path_1.resolve)(exports.SCHEMA_ROOT, 'bom-1.4.SNAPSHOT.schema.json'),
            [enums_1.Version.v1dot3]: (0, node_path_1.resolve)(exports.SCHEMA_ROOT, 'bom-1.3.SNAPSHOT.schema.json'),
            [enums_1.Version.v1dot2]: (0, node_path_1.resolve)(exports.SCHEMA_ROOT, 'bom-1.2.SNAPSHOT.schema.json'),
            [enums_1.Version.v1dot1]: undefined,
            [enums_1.Version.v1dot0]: undefined
        }),
        JSON_STRICT_SCHEMA: Object.freeze({
            [enums_1.Version.v1dot7]: (0, node_path_1.resolve)(exports.SCHEMA_ROOT, 'bom-1.7.SNAPSHOT.schema.json'),
            [enums_1.Version.v1dot6]: (0, node_path_1.resolve)(exports.SCHEMA_ROOT, 'bom-1.6.SNAPSHOT.schema.json'),
            [enums_1.Version.v1dot5]: (0, node_path_1.resolve)(exports.SCHEMA_ROOT, 'bom-1.5.SNAPSHOT.schema.json'),
            [enums_1.Version.v1dot4]: (0, node_path_1.resolve)(exports.SCHEMA_ROOT, 'bom-1.4.SNAPSHOT.schema.json'),
            [enums_1.Version.v1dot3]: (0, node_path_1.resolve)(exports.SCHEMA_ROOT, 'bom-1.3-strict.SNAPSHOT.schema.json'),
            [enums_1.Version.v1dot2]: (0, node_path_1.resolve)(exports.SCHEMA_ROOT, 'bom-1.2-strict.SNAPSHOT.schema.json'),
            [enums_1.Version.v1dot1]: undefined,
            [enums_1.Version.v1dot0]: undefined
        })
    }),
    SPDX: Object.freeze({
        XML_SCHEMA: (0, node_path_1.resolve)(exports.SCHEMA_ROOT, 'spdx.SNAPSHOT.xsd'),
        JSON_SCHEMA: (0, node_path_1.resolve)(exports.SCHEMA_ROOT, 'spdx.SNAPSHOT.schema.json')
    }),
    CryptoDefs: Object.freeze({
        JSON_SCHEMA: (0, node_path_1.resolve)(exports.SCHEMA_ROOT, 'cryptography-defs.SNAPSHOT.schema.json')
    }),
    JSF: Object.freeze({
        JSON_SCHEMA: (0, node_path_1.resolve)(exports.SCHEMA_ROOT, 'jsf-0.82.SNAPSHOT.schema.json')
    })
});
//# sourceMappingURL=resources.node.js.map

},
13232(__unused_rspack_module, exports, __webpack_require__) {

/*!
This file is part of CycloneDX JavaScript Library.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

   http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.

SPDX-License-Identifier: Apache-2.0
Copyright (c) OWASP Foundation. All Rights Reserved.
*/
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.BaseSerializer = void 0;
const tree_1 = __webpack_require__(39971);
const bomRefDiscriminator_1 = __webpack_require__(24808);
class BaseSerializer {
    *#getAllBomRefs(bom) {
        if (bom.metadata.component !== undefined) {
            yield bom.metadata.component.bomRef;
            for (const { bomRef } of bom.metadata.component.components[tree_1.treeIteratorSymbol]()) {
                yield bomRef;
            }
        }
        for (const { bomRef } of bom.components[tree_1.treeIteratorSymbol]()) {
            yield bomRef;
        }
        for (const { bomRef } of bom.services[tree_1.treeIteratorSymbol]()) {
            yield bomRef;
        }
        for (const { bomRef } of bom.vulnerabilities) {
            yield bomRef;
        }
    }
    #normalize(bom, options) {
        const bomRefDiscriminator = new bomRefDiscriminator_1.BomRefDiscriminator(this.#getAllBomRefs(bom));
        bomRefDiscriminator.discriminate();
        try {
            return this._normalize(bom, options);
        }
        finally {
            bomRefDiscriminator.reset();
        }
    }
    serialize(bom, options) {
        return this._serialize(this.#normalize(bom, options), options);
    }
}
exports.BaseSerializer = BaseSerializer;
//# sourceMappingURL=baseSerializer.js.map

},
24808(__unused_rspack_module, exports) {

/*!
This file is part of CycloneDX JavaScript Library.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

   http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.

SPDX-License-Identifier: Apache-2.0
Copyright (c) OWASP Foundation. All Rights Reserved.
*/
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.BomRefDiscriminator = void 0;
class BomRefDiscriminator {
    #originalValues;
    #prefix;
    constructor(bomRefs, prefix = 'BomRef') {
        this.#originalValues = Array.from(bomRefs, r => [r, r.value]);
        this.#prefix = prefix;
    }
    get prefix() {
        return this.#prefix;
    }
    *[Symbol.iterator]() {
        for (const [bomRef] of this.#originalValues) {
            yield bomRef;
        }
    }
    discriminate() {
        const knownRefValues = new Set(['']);
        for (const [bomRef] of this.#originalValues) {
            let value = bomRef.value;
            if (value === undefined || knownRefValues.has(value)) {
                value = this.#makeUniqueId();
                bomRef.value = value;
            }
            knownRefValues.add(value);
        }
    }
    reset() {
        for (const [bomRef, originalValue] of this.#originalValues) {
            bomRef.value = originalValue;
        }
    }
    #makeUniqueId() {
        return `${this.#prefix}${Math.random().toString(32).substring(1)}${Math.random().toString(32).substring(1)}`;
    }
}
exports.BomRefDiscriminator = BomRefDiscriminator;
//# sourceMappingURL=bomRefDiscriminator.js.map

},
92934(__unused_rspack_module, exports, __webpack_require__) {

/*!
This file is part of CycloneDX JavaScript Library.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

   http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.

SPDX-License-Identifier: Apache-2.0
Copyright (c) OWASP Foundation. All Rights Reserved.
*/
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.MissingOptionalDependencyError = void 0;
const errors_1 = __webpack_require__(56296);
class MissingOptionalDependencyError extends errors_1.OptPlugError {
}
exports.MissingOptionalDependencyError = MissingOptionalDependencyError;
//# sourceMappingURL=errors.js.map

},
45506(__unused_rspack_module, exports, __webpack_require__) {

/*!
This file is part of CycloneDX JavaScript Library.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

   http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.

SPDX-License-Identifier: Apache-2.0
Copyright (c) OWASP Foundation. All Rights Reserved.
*/
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.XML = exports.JSON = exports.Types = void 0;
__exportStar(__webpack_require__(24808), exports);
__exportStar(__webpack_require__(92934), exports);
exports.Types = __importStar(__webpack_require__(32480));
__exportStar(__webpack_require__(13232), exports);
exports.JSON = __importStar(__webpack_require__(71436));
__exportStar(__webpack_require__(98071), exports);
exports.XML = __importStar(__webpack_require__(16203));
__exportStar(__webpack_require__(69945), exports);
//# sourceMappingURL=index.common.js.map

},
93947(__unused_rspack_module, exports, __webpack_require__) {

/*!
This file is part of CycloneDX JavaScript Library.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

   http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.

SPDX-License-Identifier: Apache-2.0
Copyright (c) OWASP Foundation. All Rights Reserved.
*/
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
__exportStar(__webpack_require__(45506), exports);
__exportStar(__webpack_require__(93708), exports);
//# sourceMappingURL=index.node.js.map

},
71436(__unused_rspack_module, exports, __webpack_require__) {

/*!
This file is part of CycloneDX JavaScript Library.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

   http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.

SPDX-License-Identifier: Apache-2.0
Copyright (c) OWASP Foundation. All Rights Reserved.
*/
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.Types = exports.Normalize = void 0;
exports.Normalize = __importStar(__webpack_require__(15487));
exports.Types = __importStar(__webpack_require__(26345));
//# sourceMappingURL=index.js.map

},
15487(__unused_rspack_module, exports, __webpack_require__) {

/*!
This file is part of CycloneDX JavaScript Library.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

   http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.

SPDX-License-Identifier: Apache-2.0
Copyright (c) OWASP Foundation. All Rights Reserved.
*/
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.VulnerabilityAnalysisNormalizer = exports.VulnerabilityAffectedVersionNormalizer = exports.VulnerabilityAffectNormalizer = exports.VulnerabilityCreditsNormalizer = exports.VulnerabilityAdvisoryNormalizer = exports.VulnerabilityRatingNormalizer = exports.VulnerabilityReferenceNormalizer = exports.VulnerabilitySourceNormalizer = exports.VulnerabilityNormalizer = exports.DependencyGraphNormalizer = exports.PropertyNormalizer = exports.AttachmentNormalizer = exports.ExternalReferenceNormalizer = exports.SWIDNormalizer = exports.LicenseNormalizer = exports.ComponentEvidenceNormalizer = exports.ServiceNormalizer = exports.ComponentNormalizer = exports.OrganizationalEntityNormalizer = exports.OrganizationalContactNormalizer = exports.HashNormalizer = exports.ToolsNormalizer = exports.ToolNormalizer = exports.LifecycleNormalizer = exports.MetadataNormalizer = exports.BomNormalizer = exports.Factory = void 0;
const iterable_1 = __webpack_require__(63969);
const notUndefined_1 = __webpack_require__(15696);
const tree_1 = __webpack_require__(39971);
const uri_1 = __webpack_require__(32089);
const license_1 = __webpack_require__(81884);
const lifecycle_1 = __webpack_require__(95239);
const tool_1 = __webpack_require__(62417);
const affect_1 = __webpack_require__(1429);
const spdx_1 = __webpack_require__(97517);
const enums_1 = __webpack_require__(45928);
const types_1 = __webpack_require__(26345);
class Factory {
    #spec;
    constructor(spec) {
        this.#spec = spec;
    }
    get spec() {
        return this.#spec;
    }
    makeForBom() {
        return new BomNormalizer(this);
    }
    makeForMetadata() {
        return new MetadataNormalizer(this);
    }
    makeForComponent() {
        return new ComponentNormalizer(this);
    }
    makeForService() {
        return new ServiceNormalizer(this);
    }
    makeForComponentEvidence() {
        return new ComponentEvidenceNormalizer(this);
    }
    makeForLifecycle() {
        return new LifecycleNormalizer(this);
    }
    makeForTool() {
        return new ToolNormalizer(this);
    }
    makeForTools() {
        return new ToolsNormalizer(this);
    }
    makeForOrganizationalContact() {
        return new OrganizationalContactNormalizer(this);
    }
    makeForOrganizationalEntity() {
        return new OrganizationalEntityNormalizer(this);
    }
    makeForHash() {
        return new HashNormalizer(this);
    }
    makeForLicense() {
        return new LicenseNormalizer(this);
    }
    makeForSWID() {
        return new SWIDNormalizer(this);
    }
    makeForExternalReference() {
        return new ExternalReferenceNormalizer(this);
    }
    makeForAttachment() {
        return new AttachmentNormalizer(this);
    }
    makeForProperty() {
        return new PropertyNormalizer(this);
    }
    makeForDependencyGraph() {
        return new DependencyGraphNormalizer(this);
    }
    makeForVulnerability() {
        return new VulnerabilityNormalizer(this);
    }
    makeForVulnerabilitySource() {
        return new VulnerabilitySourceNormalizer(this);
    }
    makeForVulnerabilityReference() {
        return new VulnerabilityReferenceNormalizer(this);
    }
    makeForVulnerabilityRating() {
        return new VulnerabilityRatingNormalizer(this);
    }
    makeForVulnerabilityAdvisory() {
        return new VulnerabilityAdvisoryNormalizer(this);
    }
    makeForVulnerabilityCredits() {
        return new VulnerabilityCreditsNormalizer(this);
    }
    makeForVulnerabilityAffect() {
        return new VulnerabilityAffectNormalizer(this);
    }
    makeForVulnerabilityAffectedVersion() {
        return new VulnerabilityAffectedVersionNormalizer(this);
    }
    makeForVulnerabilityAnalysis() {
        return new VulnerabilityAnalysisNormalizer(this);
    }
}
exports.Factory = Factory;
const schemaUrl = new Map([
    [enums_1.Version.v1dot7, 'http://cyclonedx.org/schema/bom-1.7.schema.json'],
    [enums_1.Version.v1dot6, 'http://cyclonedx.org/schema/bom-1.6.schema.json'],
    [enums_1.Version.v1dot5, 'http://cyclonedx.org/schema/bom-1.5.schema.json'],
    [enums_1.Version.v1dot4, 'http://cyclonedx.org/schema/bom-1.4.schema.json'],
    [enums_1.Version.v1dot3, 'http://cyclonedx.org/schema/bom-1.3a.schema.json'],
    [enums_1.Version.v1dot2, 'http://cyclonedx.org/schema/bom-1.2b.schema.json']
]);
class BaseJsonNormalizer {
    _factory;
    constructor(factory) {
        this._factory = factory;
    }
    get factory() {
        return this._factory;
    }
}
class BomNormalizer extends BaseJsonNormalizer {
    normalize(data, options) {
        return {
            $schema: schemaUrl.get(this._factory.spec.version),
            bomFormat: 'CycloneDX',
            specVersion: this._factory.spec.version,
            version: data.version,
            serialNumber: this.#isEligibleSerialNumber(data.serialNumber)
                ? data.serialNumber
                : undefined,
            metadata: this._factory.makeForMetadata().normalize(data.metadata, options),
            components: data.components.size > 0
                ? this._factory.makeForComponent().normalizeIterable(data.components, options)
                : [],
            services: this._factory.spec.supportsServices && data.services.size > 0
                ? this._factory.makeForService().normalizeIterable(data.services, options)
                : undefined,
            dependencies: this._factory.spec.supportsDependencyGraph
                ? this._factory.makeForDependencyGraph().normalize(data, options)
                : undefined,
            vulnerabilities: this._factory.spec.supportsVulnerabilities && data.vulnerabilities.size > 0
                ? this._factory.makeForVulnerability().normalizeIterable(data.vulnerabilities, options)
                : undefined
        };
    }
    #isEligibleSerialNumber(v) {
        return v !== undefined &&
            /^urn:uuid:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v);
    }
}
exports.BomNormalizer = BomNormalizer;
class MetadataNormalizer extends BaseJsonNormalizer {
    normalize(data, options) {
        const orgEntityNormalizer = this._factory.makeForOrganizationalEntity();
        return {
            timestamp: data.timestamp?.toISOString(),
            lifecycles: this._factory.spec.supportsMetadataLifecycles && data.lifecycles.size > 0
                ? this._factory.makeForLifecycle().normalizeIterable(data.lifecycles, options)
                : undefined,
            tools: data.tools.size > 0
                ? this._factory.makeForTools().normalize(data.tools, options)
                : undefined,
            authors: data.authors.size > 0
                ? this._factory.makeForOrganizationalContact().normalizeIterable(data.authors, options)
                : undefined,
            component: data.component === undefined
                ? undefined
                : this._factory.makeForComponent().normalize(data.component, options),
            manufacture: data.manufacture === undefined
                ? undefined
                : orgEntityNormalizer.normalize(data.manufacture, options),
            supplier: data.supplier === undefined
                ? undefined
                : orgEntityNormalizer.normalize(data.supplier, options),
            licenses: this._factory.spec.supportsMetadataLicenses && data.licenses.size > 0
                ? this._factory.makeForLicense().normalizeIterable(data.licenses, options)
                : undefined,
            properties: this._factory.spec.supportsMetadataProperties && data.properties.size > 0
                ? this._factory.makeForProperty().normalizeIterable(data.properties, options)
                : undefined
        };
    }
}
exports.MetadataNormalizer = MetadataNormalizer;
class LifecycleNormalizer extends BaseJsonNormalizer {
    normalize(data, options) {
        return data instanceof lifecycle_1.NamedLifecycle
            ? { name: data.name, description: data.description }
            : { phase: data };
    }
    normalizeIterable(data, options) {
        return (options.sortLists ?? false
            ? data.sorted()
            : Array.from(data)).map(lc => this.normalize(lc, options));
    }
}
exports.LifecycleNormalizer = LifecycleNormalizer;
class ToolNormalizer extends BaseJsonNormalizer {
    normalize(data, options) {
        return {
            vendor: data.vendor || undefined,
            name: data.name || undefined,
            version: data.version || undefined,
            hashes: data.hashes.size > 0
                ? this._factory.makeForHash().normalizeIterable(data.hashes, options)
                : undefined,
            externalReferences: this._factory.spec.supportsToolReferences && data.externalReferences.size > 0
                ? this._factory.makeForExternalReference().normalizeIterable(data.externalReferences, options)
                : undefined
        };
    }
    normalizeIterable(data, options) {
        return (options.sortLists ?? false
            ? data.sorted()
            : Array.from(data)).map(t => this.normalize(t, options));
    }
}
exports.ToolNormalizer = ToolNormalizer;
class ToolsNormalizer extends BaseJsonNormalizer {
    normalize(data, options) {
        if (data.tools.size > 0 || !this._factory.spec.supportsToolsComponentsServices) {
            return this._factory.makeForTool().normalizeIterable(new tool_1.ToolRepository((0, iterable_1.chainI)(Array.from(data.components, tool_1.Tool.fromComponent), Array.from(data.services, tool_1.Tool.fromService), data.tools)), options);
        }
        return {
            components: data.components.size > 0
                ? this._factory.makeForComponent().normalizeIterable(data.components, options)
                : undefined,
            services: data.services.size > 0
                ? this._factory.makeForService().normalizeIterable(data.services, options)
                : undefined
        };
    }
}
exports.ToolsNormalizer = ToolsNormalizer;
class HashNormalizer extends BaseJsonNormalizer {
    normalize([algorithm, content], options) {
        const spec = this._factory.spec;
        return spec.supportsHashAlgorithm(algorithm) && spec.supportsHashValue(content)
            ? {
                alg: algorithm,
                content
            }
            : undefined;
    }
    normalizeIterable(data, options) {
        return (options.sortLists ?? false
            ? data.sorted()
            : Array.from(data)).map(h => this.normalize(h, options)).filter(notUndefined_1.isNotUndefined);
    }
}
exports.HashNormalizer = HashNormalizer;
class OrganizationalContactNormalizer extends BaseJsonNormalizer {
    normalize(data, options) {
        return {
            name: data.name || undefined,
            email: types_1.JsonSchema.isIdnEmail(data.email)
                ? data.email
                : undefined,
            phone: data.phone || undefined
        };
    }
    normalizeIterable(data, options) {
        return (options.sortLists ?? false
            ? data.sorted()
            : Array.from(data)).map(oc => this.normalize(oc, options));
    }
}
exports.OrganizationalContactNormalizer = OrganizationalContactNormalizer;
class OrganizationalEntityNormalizer extends BaseJsonNormalizer {
    normalize(data, options) {
        const urls = normalizeStringableIter(Array.from(data.url, (s) => (0, uri_1.escapeUri)(s.toString())), options).filter(types_1.JsonSchema.isIriReference);
        return {
            name: data.name || undefined,
            url: urls.length > 0
                ? urls
                : undefined,
            contact: data.contact.size > 0
                ? this._factory.makeForOrganizationalContact().normalizeIterable(data.contact, options)
                : undefined
        };
    }
    normalizeIterable(data, options) {
        return (options.sortLists ?? false
            ? data.sorted()
            : Array.from(data)).map(oe => this.normalize(oe, options));
    }
}
exports.OrganizationalEntityNormalizer = OrganizationalEntityNormalizer;
class ComponentNormalizer extends BaseJsonNormalizer {
    normalize(data, options) {
        const spec = this._factory.spec;
        if (!spec.supportsComponentType(data.type)) {
            return undefined;
        }
        const version = data.version ?? '';
        return {
            type: data.type,
            name: data.name,
            group: data.group || undefined,
            version: version.length > 0 || spec.requiresComponentVersion
                ? version
                : undefined,
            'bom-ref': data.bomRef.value || undefined,
            supplier: data.supplier === undefined
                ? undefined
                : this._factory.makeForOrganizationalEntity().normalize(data.supplier, options),
            author: data.author || undefined,
            publisher: data.publisher || undefined,
            description: data.description || undefined,
            scope: data.scope,
            hashes: data.hashes.size > 0
                ? this._factory.makeForHash().normalizeIterable(data.hashes, options)
                : undefined,
            licenses: data.licenses.size > 0
                ? this._factory.makeForLicense().normalizeIterable(data.licenses, options)
                : undefined,
            copyright: data.copyright?.toString() || undefined,
            cpe: data.cpe || undefined,
            purl: data.purl?.toString(),
            swid: data.swid === undefined
                ? undefined
                : this._factory.makeForSWID().normalize(data.swid, options),
            externalReferences: data.externalReferences.size > 0
                ? this._factory.makeForExternalReference().normalizeIterable(data.externalReferences, options)
                : undefined,
            properties: spec.supportsProperties(data) && data.properties.size > 0
                ? this._factory.makeForProperty().normalizeIterable(data.properties, options)
                : undefined,
            components: data.components.size > 0
                ? this.normalizeIterable(data.components, options)
                : undefined,
            evidence: spec.supportsComponentEvidence && data.evidence !== undefined
                ? this._factory.makeForComponentEvidence().normalize(data.evidence, options)
                : undefined
        };
    }
    normalizeIterable(data, options) {
        return (options.sortLists ?? false
            ? data.sorted()
            : Array.from(data)).map(c => this.normalize(c, options)).filter(notUndefined_1.isNotUndefined);
    }
}
exports.ComponentNormalizer = ComponentNormalizer;
class ServiceNormalizer extends BaseJsonNormalizer {
    normalize(data, options) {
        const spec = this._factory.spec;
        return {
            'bom-ref': data.bomRef.value || undefined,
            provider: data.provider
                ? this._factory.makeForOrganizationalEntity().normalize(data.provider, options)
                : undefined,
            group: data.group,
            name: data.name,
            version: data.version || undefined,
            description: data.description || undefined,
            licenses: data.licenses.size > 0
                ? this._factory.makeForLicense().normalizeIterable(data.licenses, options)
                : undefined,
            externalReferences: data.externalReferences.size > 0
                ? this._factory.makeForExternalReference().normalizeIterable(data.externalReferences, options)
                : undefined,
            services: data.services.size > 0
                ? this._factory.makeForService().normalizeIterable(data.services, options)
                : undefined,
            properties: spec.supportsProperties(data) && data.properties.size > 0
                ? this._factory.makeForProperty().normalizeIterable(data.properties, options)
                : undefined,
        };
    }
    normalizeIterable(data, options) {
        return (options.sortLists ?? false
            ? data.sorted()
            : Array.from(data)).map(s => this.normalize(s, options));
    }
}
exports.ServiceNormalizer = ServiceNormalizer;
class ComponentEvidenceNormalizer extends BaseJsonNormalizer {
    normalize(data, options) {
        return {
            licenses: data.licenses.size > 0
                ? this._factory.makeForLicense().normalizeIterable(data.licenses, options)
                : undefined,
            copyright: data.copyright.size > 0
                ? (options.sortLists
                    ? data.copyright.sorted().map(ComponentEvidenceNormalizer.#normalizeCopyright)
                    : Array.from(data.copyright, ComponentEvidenceNormalizer.#normalizeCopyright))
                : undefined
        };
    }
    static #normalizeCopyright(c) {
        return { text: c.toString() };
    }
}
exports.ComponentEvidenceNormalizer = ComponentEvidenceNormalizer;
class LicenseNormalizer extends BaseJsonNormalizer {
    normalize(data, options) {
        switch (true) {
            case data instanceof license_1.NamedLicense:
                return this.#normalizeNamedLicense(data, options);
            case data instanceof license_1.SpdxLicense:
                return (0, spdx_1.isSupportedSpdxId)(data.id)
                    ? this.#normalizeSpdxLicense(data, options)
                    : this.#normalizeNamedLicense(new license_1.NamedLicense(data.id, { url: data.url }), options);
            case data instanceof license_1.LicenseExpression:
                return this.#normalizeLicenseExpression(data);
            default:
                throw new TypeError('Unexpected LicenseChoice');
        }
    }
    #normalizeNamedLicense(data, options) {
        const spec = this._factory.spec;
        const url = (0, uri_1.escapeUri)(data.url?.toString());
        return {
            license: {
                name: data.name,
                acknowledgement: spec.supportsLicenseAcknowledgement
                    ? data.acknowledgement
                    : undefined,
                text: data.text === undefined
                    ? undefined
                    : this._factory.makeForAttachment().normalize(data.text, options),
                url: types_1.JsonSchema.isIriReference(url)
                    ? url
                    : undefined,
                properties: spec.supportsProperties(data) && data.properties.size > 0
                    ? this._factory.makeForProperty().normalizeIterable(data.properties, options)
                    : undefined
            }
        };
    }
    #normalizeSpdxLicense(data, options) {
        const spec = this._factory.spec;
        const url = (0, uri_1.escapeUri)(data.url?.toString());
        return {
            license: {
                id: data.id,
                acknowledgement: spec.supportsLicenseAcknowledgement
                    ? data.acknowledgement
                    : undefined,
                text: data.text === undefined
                    ? undefined
                    : this._factory.makeForAttachment().normalize(data.text, options),
                url: types_1.JsonSchema.isIriReference(url)
                    ? url
                    : undefined,
                properties: spec.supportsProperties(data) && data.properties.size > 0
                    ? this._factory.makeForProperty().normalizeIterable(data.properties, options)
                    : undefined
            }
        };
    }
    #normalizeLicenseExpression(data) {
        return {
            expression: data.expression,
            acknowledgement: this._factory.spec.supportsLicenseAcknowledgement
                ? data.acknowledgement
                : undefined
        };
    }
    normalizeIterable(data, options) {
        const licenses = options.sortLists ?? false
            ? data.sorted()
            : Array.from(data);
        if (licenses.length > 1) {
            const expressions = licenses.filter(l => l instanceof license_1.LicenseExpression);
            if (expressions.length > 0) {
                return [this.#normalizeLicenseExpression(expressions[0])];
            }
        }
        return licenses.map(l => this.normalize(l, options));
    }
}
exports.LicenseNormalizer = LicenseNormalizer;
class SWIDNormalizer extends BaseJsonNormalizer {
    normalize(data, options) {
        const url = (0, uri_1.escapeUri)(data.url?.toString());
        return {
            tagId: data.tagId,
            name: data.name,
            version: data.version || undefined,
            tagVersion: data.tagVersion,
            patch: data.patch,
            text: data.text === undefined
                ? undefined
                : this._factory.makeForAttachment().normalize(data.text, options),
            url: types_1.JsonSchema.isIriReference(url)
                ? url
                : undefined
        };
    }
}
exports.SWIDNormalizer = SWIDNormalizer;
class ExternalReferenceNormalizer extends BaseJsonNormalizer {
    normalize(data, options) {
        return this._factory.spec.supportsExternalReferenceType(data.type)
            ? {
                url: (0, uri_1.escapeUri)(data.url.toString()),
                type: data.type,
                hashes: this._factory.spec.supportsExternalReferenceHashes && data.hashes.size > 0
                    ? this._factory.makeForHash().normalizeIterable(data.hashes, options)
                    : undefined,
                comment: data.comment || undefined
            }
            : undefined;
    }
    normalizeIterable(data, options) {
        return (options.sortLists ?? false
            ? data.sorted()
            : Array.from(data)).map(r => this.normalize(r, options)).filter(notUndefined_1.isNotUndefined);
    }
}
exports.ExternalReferenceNormalizer = ExternalReferenceNormalizer;
class AttachmentNormalizer extends BaseJsonNormalizer {
    normalize(data, options) {
        return {
            content: data.content.toString(),
            contentType: data.contentType || undefined,
            encoding: data.encoding
        };
    }
}
exports.AttachmentNormalizer = AttachmentNormalizer;
class PropertyNormalizer extends BaseJsonNormalizer {
    normalize(data, options) {
        return {
            name: data.name,
            value: data.value
        };
    }
    normalizeIterable(data, options) {
        return (options.sortLists ?? false
            ? data.sorted()
            : Array.from(data)).map(p => this.normalize(p, options));
    }
}
exports.PropertyNormalizer = PropertyNormalizer;
class DependencyGraphNormalizer extends BaseJsonNormalizer {
    normalize(data, options) {
        const allRefs = new Map();
        if (data.metadata.component !== undefined) {
            allRefs.set(data.metadata.component.bomRef, data.metadata.component.dependencies);
            for (const component of data.metadata.component.components[tree_1.treeIteratorSymbol]()) {
                allRefs.set(component.bomRef, component.dependencies);
            }
        }
        for (const component of data.components[tree_1.treeIteratorSymbol]()) {
            allRefs.set(component.bomRef, component.dependencies);
        }
        for (const service of data.services[tree_1.treeIteratorSymbol]()) {
            allRefs.set(service.bomRef, service.dependencies);
        }
        const normalized = [];
        for (const [ref, deps] of allRefs) {
            const dep = this.#normalizeDependency(ref, deps, allRefs, options);
            if ((0, notUndefined_1.isNotUndefined)(dep)) {
                normalized.push(dep);
            }
        }
        if (options.sortLists ?? false) {
            normalized.sort(({ ref: a }, { ref: b }) => a.localeCompare(b));
        }
        return normalized;
    }
    #normalizeDependency(ref, deps, allRefs, options) {
        const bomRef = ref.toString();
        if (bomRef.length === 0) {
            return undefined;
        }
        const dependsOn = normalizeStringableIter(Array.from(deps).filter(d => allRefs.has(d) && d !== ref), options).filter(d => d.length > 0);
        return {
            ref: bomRef,
            dependsOn: dependsOn.length > 0
                ? dependsOn
                : undefined
        };
    }
}
exports.DependencyGraphNormalizer = DependencyGraphNormalizer;
class VulnerabilityNormalizer extends BaseJsonNormalizer {
    normalize(data, options) {
        return {
            'bom-ref': data.bomRef.value || undefined,
            id: data.id || undefined,
            source: data.source === undefined
                ? undefined
                : this._factory.makeForVulnerabilitySource().normalize(data.source, options),
            references: data.references.size > 0
                ? this._factory.makeForVulnerabilityReference().normalizeIterable(data.references, options)
                : undefined,
            ratings: data.ratings.size > 0
                ? this._factory.makeForVulnerabilityRating().normalizeIterable(data.ratings, options)
                : undefined,
            cwes: data.cwes.size > 0
                ? (options.sortLists ?? false
                    ? data.cwes.sorted()
                    : Array.from(data.cwes))
                : undefined,
            description: data.description,
            detail: data.detail,
            recommendation: data.recommendation,
            advisories: data.advisories.size > 0
                ? this._factory.makeForVulnerabilityAdvisory().normalizeIterable(data.advisories, options)
                : undefined,
            created: data.created?.toISOString(),
            published: data.published?.toISOString(),
            updated: data.updated?.toISOString(),
            credits: data.credits === undefined
                ? undefined
                : this._factory.makeForVulnerabilityCredits().normalize(data.credits, options),
            tools: data.tools.size > 0
                ? this._factory.makeForTools().normalize(data.tools, options)
                : undefined,
            analysis: data.analysis === undefined
                ? undefined
                : this._factory.makeForVulnerabilityAnalysis().normalize(data.analysis, options),
            affects: data.affects.size > 0
                ? this._factory.makeForVulnerabilityAffect().normalizeIterable(data.affects, options)
                : undefined,
            properties: data.properties.size > 0
                ? this._factory.makeForProperty().normalizeIterable(data.properties, options)
                : undefined
        };
    }
    normalizeIterable(data, options) {
        return (options.sortLists ?? false
            ? data.sorted()
            : Array.from(data)).map(v => this.normalize(v, options));
    }
}
exports.VulnerabilityNormalizer = VulnerabilityNormalizer;
class VulnerabilitySourceNormalizer extends BaseJsonNormalizer {
    normalize(data, options) {
        return {
            name: data.name,
            url: data.url?.toString()
        };
    }
}
exports.VulnerabilitySourceNormalizer = VulnerabilitySourceNormalizer;
class VulnerabilityReferenceNormalizer extends BaseJsonNormalizer {
    normalize(data, options) {
        return {
            id: data.id,
            source: this._factory.makeForVulnerabilitySource().normalize(data.source, options)
        };
    }
    normalizeIterable(data, options) {
        return (options.sortLists ?? false
            ? data.sorted()
            : Array.from(data)).map(r => this.normalize(r, options));
    }
}
exports.VulnerabilityReferenceNormalizer = VulnerabilityReferenceNormalizer;
class VulnerabilityRatingNormalizer extends BaseJsonNormalizer {
    normalize(data, options) {
        return {
            source: data.source === undefined
                ? undefined
                : this._factory.makeForVulnerabilitySource().normalize(data.source, options),
            score: data.score,
            severity: data.severity,
            method: this._factory.spec.supportsVulnerabilityRatingMethod(data.method)
                ? data.method
                : undefined,
            vector: data.vector,
            justification: data.justification
        };
    }
    normalizeIterable(data, options) {
        return (options.sortLists ?? false
            ? data.sorted()
            : Array.from(data)).map(r => this.normalize(r, options));
    }
}
exports.VulnerabilityRatingNormalizer = VulnerabilityRatingNormalizer;
class VulnerabilityAdvisoryNormalizer extends BaseJsonNormalizer {
    normalize(data, options) {
        const url = (0, uri_1.escapeUri)(data.url.toString());
        if (!types_1.JsonSchema.isIriReference(url)) {
            return undefined;
        }
        return {
            title: data.title,
            url
        };
    }
    normalizeIterable(data, options) {
        return (options.sortLists ?? false
            ? data.sorted()
            : Array.from(data)).map(a => this.normalize(a, options)).filter(notUndefined_1.isNotUndefined);
    }
}
exports.VulnerabilityAdvisoryNormalizer = VulnerabilityAdvisoryNormalizer;
class VulnerabilityCreditsNormalizer extends BaseJsonNormalizer {
    normalize(data, options) {
        return {
            organizations: data.organizations.size > 0
                ? this._factory.makeForOrganizationalEntity().normalizeIterable(data.organizations, options)
                : undefined,
            individuals: data.individuals.size > 0
                ? this._factory.makeForOrganizationalContact().normalizeIterable(data.individuals, options)
                : undefined
        };
    }
}
exports.VulnerabilityCreditsNormalizer = VulnerabilityCreditsNormalizer;
class VulnerabilityAffectNormalizer extends BaseJsonNormalizer {
    normalize(data, options) {
        return {
            ref: data.ref.toString(),
            versions: data.versions.size > 0
                ? this._factory.makeForVulnerabilityAffectedVersion().normalizeIterable(data.versions, options)
                : undefined
        };
    }
    normalizeIterable(data, options) {
        return (options.sortLists ?? false
            ? data.sorted()
            : Array.from(data)).map(a => this.normalize(a, options));
    }
}
exports.VulnerabilityAffectNormalizer = VulnerabilityAffectNormalizer;
class VulnerabilityAffectedVersionNormalizer extends BaseJsonNormalizer {
    normalize(data, options) {
        switch (true) {
            case data instanceof affect_1.AffectedSingleVersion:
                return this.#normalizeAffectedSingleVersion(data);
            case data instanceof affect_1.AffectedVersionRange:
                return this.#normalizeAffectedVersionRange(data);
            default:
                throw new TypeError('Unexpected Vulnerability AffectedVersion');
        }
    }
    #normalizeAffectedSingleVersion(data) {
        return data.version.length < 1
            ? undefined
            : {
                version: data.version.substring(0, 1024),
                status: data.status
            };
    }
    #normalizeAffectedVersionRange(data) {
        return data.range.length < 1
            ? undefined
            : {
                range: data.range.substring(0, 1024),
                status: data.status
            };
    }
    normalizeIterable(data, options) {
        return (options.sortLists ?? false
            ? data.sorted()
            : Array.from(data)).map(av => this.normalize(av, options)).filter(notUndefined_1.isNotUndefined);
    }
}
exports.VulnerabilityAffectedVersionNormalizer = VulnerabilityAffectedVersionNormalizer;
class VulnerabilityAnalysisNormalizer extends BaseJsonNormalizer {
    normalize(data, options) {
        return {
            state: data.state,
            justification: data.justification,
            response: data.response.size > 0
                ? (options.sortLists ?? false
                    ? data.response.sorted()
                    : Array.from(data.response))
                : undefined,
            detail: data.detail
        };
    }
}
exports.VulnerabilityAnalysisNormalizer = VulnerabilityAnalysisNormalizer;
function normalizeStringableIter(data, options) {
    const r = Array.from(data, d => d.toString());
    if (options.sortLists ?? false) {
        r.sort((a, b) => a.localeCompare(b));
    }
    return r;
}
//# sourceMappingURL=normalize.js.map

},
26345(__unused_rspack_module, exports) {

/*!
This file is part of CycloneDX JavaScript Library.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

   http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.

SPDX-License-Identifier: Apache-2.0
Copyright (c) OWASP Foundation. All Rights Reserved.
*/
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.JsonSchema = void 0;
var JsonSchema;
(function (JsonSchema) {
    function isIriReference(value) {
        return typeof value === 'string' &&
            value.length > 0;
    }
    JsonSchema.isIriReference = isIriReference;
    function isIdnEmail(value) {
        return typeof value === 'string' &&
            value.length > 0;
    }
    JsonSchema.isIdnEmail = isIdnEmail;
})(JsonSchema || (exports.JsonSchema = JsonSchema = {}));
//# sourceMappingURL=types.js.map

},
98071(__unused_rspack_module, exports, __webpack_require__) {

/*!
This file is part of CycloneDX JavaScript Library.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

   http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.

SPDX-License-Identifier: Apache-2.0
Copyright (c) OWASP Foundation. All Rights Reserved.
*/
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.JsonSerializer = void 0;
const enums_1 = __webpack_require__(45928);
const errors_1 = __webpack_require__(22679);
const baseSerializer_1 = __webpack_require__(13232);
class JsonSerializer extends baseSerializer_1.BaseSerializer {
    #normalizerFactory;
    constructor(normalizerFactory) {
        if (!normalizerFactory.spec.supportsFormat(enums_1.Format.JSON)) {
            throw new errors_1.UnsupportedFormatError('Spec does not support JSON format.');
        }
        super();
        this.#normalizerFactory = normalizerFactory;
    }
    get normalizerFactory() {
        return this.#normalizerFactory;
    }
    _normalize(bom, options = {}) {
        return this.#normalizerFactory.makeForBom()
            .normalize(bom, options);
    }
    _serialize(bom, { space } = {}) {
        return JSON.stringify(bom, null, space);
    }
}
exports.JsonSerializer = JsonSerializer;
//# sourceMappingURL=jsonSerializer.js.map

},
32480(__unused_rspack_module, exports) {

/*!
This file is part of CycloneDX JavaScript Library.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

   http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.

SPDX-License-Identifier: Apache-2.0
Copyright (c) OWASP Foundation. All Rights Reserved.
*/
Object.defineProperty(exports, "__esModule", ({ value: true }));
//# sourceMappingURL=types.js.map

},
89623(__unused_rspack_module, exports) {
var __webpack_unused_export__;

/*!
This file is part of CycloneDX JavaScript Library.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

   http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.

SPDX-License-Identifier: Apache-2.0
Copyright (c) OWASP Foundation. All Rights Reserved.
*/
__webpack_unused_export__ = ({ value: true });
exports.normalizedString = normalizedString;
exports.token = token;
const _normalizeStringForbiddenSearch = /\r\n|\t|\n|\r/g;
const _normalizeStringForbiddenReplace = ' ';
function normalizedString(s) {
    return s.replace(_normalizeStringForbiddenSearch, _normalizeStringForbiddenReplace);
}
const _tokenMultispaceSearch = / {2,}/g;
const _tokenMultispaceReplace = ' ';
function token(s) {
    return normalizedString(s).trim().replace(_tokenMultispaceSearch, _tokenMultispaceReplace);
}
//# sourceMappingURL=_xsd.js.map

},
16203(__unused_rspack_module, exports, __webpack_require__) {

/*!
This file is part of CycloneDX JavaScript Library.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

   http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.

SPDX-License-Identifier: Apache-2.0
Copyright (c) OWASP Foundation. All Rights Reserved.
*/
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.Types = exports.Normalize = void 0;
exports.Normalize = __importStar(__webpack_require__(67784));
exports.Types = __importStar(__webpack_require__(73834));
//# sourceMappingURL=index.js.map

},
67784(__unused_rspack_module, exports, __webpack_require__) {

/*!
This file is part of CycloneDX JavaScript Library.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

   http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.

SPDX-License-Identifier: Apache-2.0
Copyright (c) OWASP Foundation. All Rights Reserved.
*/
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.VulnerabilityAffectedVersionNormalizer = exports.VulnerabilityAffectNormalizer = exports.VulnerabilityAnalysisNormalizer = exports.VulnerabilityCreditsNormalizer = exports.VulnerabilityAdvisoryNormalizer = exports.VulnerabilityRatingNormalizer = exports.VulnerabilityReferenceNormalizer = exports.VulnerabilitySourceNormalizer = exports.VulnerabilityNormalizer = exports.DependencyGraphNormalizer = exports.PropertyNormalizer = exports.AttachmentNormalizer = exports.ExternalReferenceNormalizer = exports.SWIDNormalizer = exports.LicenseNormalizer = exports.ComponentEvidenceNormalizer = exports.ServiceNormalizer = exports.ComponentNormalizer = exports.OrganizationalEntityNormalizer = exports.OrganizationalContactNormalizer = exports.HashNormalizer = exports.ToolsNormalizer = exports.ToolNormalizer = exports.LifecycleNormalizer = exports.MetadataNormalizer = exports.BomNormalizer = exports.Factory = void 0;
const iterable_1 = __webpack_require__(63969);
const notUndefined_1 = __webpack_require__(15696);
const tree_1 = __webpack_require__(39971);
const uri_1 = __webpack_require__(32089);
const models_1 = __webpack_require__(59431);
const license_1 = __webpack_require__(81884);
const lifecycle_1 = __webpack_require__(95239);
const affect_1 = __webpack_require__(1429);
const spdx_1 = __webpack_require__(97517);
const enums_1 = __webpack_require__(45928);
const _xsd_1 = __webpack_require__(89623);
const types_1 = __webpack_require__(73834);
class Factory {
    #spec;
    constructor(spec) {
        this.#spec = spec;
    }
    get spec() {
        return this.#spec;
    }
    makeForBom() {
        return new BomNormalizer(this);
    }
    makeForMetadata() {
        return new MetadataNormalizer(this);
    }
    makeForLifecycle() {
        return new LifecycleNormalizer(this);
    }
    makeForComponent() {
        return new ComponentNormalizer(this);
    }
    makeForService() {
        return new ServiceNormalizer(this);
    }
    makeForComponentEvidence() {
        return new ComponentEvidenceNormalizer(this);
    }
    makeForTool() {
        return new ToolNormalizer(this);
    }
    makeForTools() {
        return new ToolsNormalizer(this);
    }
    makeForOrganizationalContact() {
        return new OrganizationalContactNormalizer(this);
    }
    makeForOrganizationalEntity() {
        return new OrganizationalEntityNormalizer(this);
    }
    makeForHash() {
        return new HashNormalizer(this);
    }
    makeForLicense() {
        return new LicenseNormalizer(this);
    }
    makeForSWID() {
        return new SWIDNormalizer(this);
    }
    makeForExternalReference() {
        return new ExternalReferenceNormalizer(this);
    }
    makeForAttachment() {
        return new AttachmentNormalizer(this);
    }
    makeForProperty() {
        return new PropertyNormalizer(this);
    }
    makeForDependencyGraph() {
        return new DependencyGraphNormalizer(this);
    }
    makeForVulnerability() {
        return new VulnerabilityNormalizer(this);
    }
    makeForVulnerabilitySource() {
        return new VulnerabilitySourceNormalizer(this);
    }
    makeForVulnerabilityReference() {
        return new VulnerabilityReferenceNormalizer(this);
    }
    makeForVulnerabilityRating() {
        return new VulnerabilityRatingNormalizer(this);
    }
    makeForVulnerabilityAdvisory() {
        return new VulnerabilityAdvisoryNormalizer(this);
    }
    makeForVulnerabilityCredits() {
        return new VulnerabilityCreditsNormalizer(this);
    }
    makeForVulnerabilityAffect() {
        return new VulnerabilityAffectNormalizer(this);
    }
    makeForVulnerabilityAffectedVersion() {
        return new VulnerabilityAffectedVersionNormalizer(this);
    }
    makeForVulnerabilityAnalysis() {
        return new VulnerabilityAnalysisNormalizer(this);
    }
}
exports.Factory = Factory;
const xmlNamespace = new Map([
    [enums_1.Version.v1dot7, 'http://cyclonedx.org/schema/bom/1.7'],
    [enums_1.Version.v1dot6, 'http://cyclonedx.org/schema/bom/1.6'],
    [enums_1.Version.v1dot5, 'http://cyclonedx.org/schema/bom/1.5'],
    [enums_1.Version.v1dot4, 'http://cyclonedx.org/schema/bom/1.4'],
    [enums_1.Version.v1dot3, 'http://cyclonedx.org/schema/bom/1.3'],
    [enums_1.Version.v1dot2, 'http://cyclonedx.org/schema/bom/1.2'],
    [enums_1.Version.v1dot1, 'http://cyclonedx.org/schema/bom/1.1'],
    [enums_1.Version.v1dot0, 'http://cyclonedx.org/schema/bom/1.0']
]);
class BaseXmlNormalizer {
    _factory;
    constructor(factory) {
        this._factory = factory;
    }
    get factory() {
        return this._factory;
    }
}
class BomNormalizer extends BaseXmlNormalizer {
    normalize(data, options) {
        const components = {
            type: 'element',
            name: 'components',
            children: data.components.size > 0
                ? this._factory.makeForComponent().normalizeIterable(data.components, options, 'component')
                : undefined
        };
        const services = this._factory.spec.supportsServices && data.services.size > 0
            ? {
                type: 'element',
                name: 'services',
                children: this._factory.makeForService().normalizeIterable(data.services, options, 'service')
            }
            : undefined;
        const vulnerabilities = this._factory.spec.supportsVulnerabilities && data.vulnerabilities.size > 0
            ? {
                type: 'element',
                name: 'vulnerabilities',
                children: this._factory.makeForVulnerability().normalizeIterable(data.vulnerabilities, options, 'vulnerability')
            }
            : undefined;
        return {
            type: 'element',
            name: 'bom',
            namespace: xmlNamespace.get(this._factory.spec.version),
            attributes: {
                version: data.version,
                serialNumber: this.#isEligibleSerialNumber(data.serialNumber)
                    ? data.serialNumber
                    : undefined
            },
            children: [
                this._factory.makeForMetadata().normalize(data.metadata, options, 'metadata'),
                components,
                services,
                this._factory.spec.supportsDependencyGraph
                    ? this._factory.makeForDependencyGraph().normalize(data, options, 'dependencies')
                    : undefined,
                vulnerabilities
            ].filter(notUndefined_1.isNotUndefined)
        };
    }
    #isEligibleSerialNumber(v) {
        return v !== undefined &&
            /^urn:uuid:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$|^\{[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\}$/.test(v);
    }
}
exports.BomNormalizer = BomNormalizer;
class MetadataNormalizer extends BaseXmlNormalizer {
    normalize(data, options, elementName) {
        const orgEntityNormalizer = this._factory.makeForOrganizationalEntity();
        const lifecycles = this._factory.spec.supportsMetadataLifecycles && data.lifecycles.size > 0
            ? {
                type: 'element',
                name: 'lifecycles',
                children: this._factory.makeForLifecycle().normalizeIterable(data.lifecycles, options, 'lifecycle')
            }
            : undefined;
        const tools = data.tools.size > 0
            ? this._factory.makeForTools().normalize(data.tools, options, 'tools')
            : undefined;
        const authors = data.authors.size > 0
            ? {
                type: 'element',
                name: 'authors',
                children: this._factory.makeForOrganizationalContact().normalizeIterable(data.authors, options, 'author')
            }
            : undefined;
        const licenses = this._factory.spec.supportsMetadataLicenses && data.licenses.size > 0
            ? {
                type: 'element',
                name: 'licenses',
                children: this._factory.makeForLicense().normalizeIterable(data.licenses, options)
            }
            : undefined;
        const properties = this._factory.spec.supportsMetadataProperties && data.properties.size > 0
            ? {
                type: 'element',
                name: 'properties',
                children: this._factory.makeForProperty().normalizeIterable(data.properties, options, 'property')
            }
            : undefined;
        return {
            type: 'element',
            name: elementName,
            children: [
                makeOptionalDateTimeElement(data.timestamp, 'timestamp'),
                lifecycles,
                tools,
                authors,
                data.component === undefined
                    ? undefined
                    : this._factory.makeForComponent().normalize(data.component, options, 'component'),
                data.manufacture === undefined
                    ? undefined
                    : orgEntityNormalizer.normalize(data.manufacture, options, 'manufacture'),
                data.supplier === undefined
                    ? undefined
                    : orgEntityNormalizer.normalize(data.supplier, options, 'supplier'),
                licenses,
                properties
            ].filter(notUndefined_1.isNotUndefined)
        };
    }
}
exports.MetadataNormalizer = MetadataNormalizer;
class LifecycleNormalizer extends BaseXmlNormalizer {
    normalize(data, options, elementName) {
        return data instanceof lifecycle_1.NamedLifecycle
            ? {
                type: 'element',
                name: elementName,
                children: [
                    makeTextElement(data.name, 'name', _xsd_1.normalizedString),
                    makeOptionalTextElement(data.description, 'description')
                ].filter(notUndefined_1.isNotUndefined)
            }
            : {
                type: 'element',
                name: elementName,
                children: [
                    makeTextElement(data, 'phase')
                ]
            };
    }
    normalizeIterable(data, options, elementName) {
        return (options.sortLists ?? false
            ? data.sorted()
            : Array.from(data)).map(t => this.normalize(t, options, elementName));
    }
}
exports.LifecycleNormalizer = LifecycleNormalizer;
class ToolNormalizer extends BaseXmlNormalizer {
    normalize(data, options, elementName) {
        const hashes = data.hashes.size > 0
            ? {
                type: 'element',
                name: 'hashes',
                children: this._factory.makeForHash().normalizeIterable(data.hashes, options, 'hash')
            }
            : undefined;
        const externalReferences = this._factory.spec.supportsToolReferences && data.externalReferences.size > 0
            ? {
                type: 'element',
                name: 'externalReferences',
                children: this._factory.makeForExternalReference().normalizeIterable(data.externalReferences, options, 'reference')
            }
            : undefined;
        return {
            type: 'element',
            name: elementName,
            children: [
                makeOptionalTextElement(data.vendor, 'vendor', _xsd_1.normalizedString),
                makeOptionalTextElement(data.name, 'name', _xsd_1.normalizedString),
                makeOptionalTextElement(data.version, 'version', _xsd_1.normalizedString),
                hashes,
                externalReferences
            ].filter(notUndefined_1.isNotUndefined)
        };
    }
    normalizeIterable(data, options, elementName) {
        return (options.sortLists ?? false
            ? data.sorted()
            : Array.from(data)).map(t => this.normalize(t, options, elementName));
    }
}
exports.ToolNormalizer = ToolNormalizer;
class ToolsNormalizer extends BaseXmlNormalizer {
    normalize(data, options, elementName) {
        let children = [];
        if (data.tools.size > 0 || !this._factory.spec.supportsToolsComponentsServices) {
            children = this._factory.makeForTool().normalizeIterable(new models_1.ToolRepository((0, iterable_1.chainI)(Array.from(data.components, models_1.Tool.fromComponent), Array.from(data.services, models_1.Tool.fromService), data.tools)), options, 'tool');
        }
        else {
            if (data.components.size > 0) {
                children.push({
                    type: 'element',
                    name: 'components',
                    children: this._factory.makeForComponent().normalizeIterable(data.components, options, 'component')
                });
            }
            if (data.services.size > 0) {
                children.push({
                    type: 'element',
                    name: 'services',
                    children: this._factory.makeForService().normalizeIterable(data.services, options, 'service')
                });
            }
        }
        return {
            type: 'element',
            name: elementName,
            children
        };
    }
}
exports.ToolsNormalizer = ToolsNormalizer;
class HashNormalizer extends BaseXmlNormalizer {
    normalize([algorithm, content], options, elementName) {
        const spec = this._factory.spec;
        return spec.supportsHashAlgorithm(algorithm) && spec.supportsHashValue(content)
            ? {
                type: 'element',
                name: elementName,
                attributes: { alg: algorithm },
                children: (0, _xsd_1.token)(content)
            }
            : undefined;
    }
    normalizeIterable(data, options, elementName) {
        return (options.sortLists ?? false
            ? data.sorted()
            : Array.from(data)).map(h => this.normalize(h, options, elementName)).filter(notUndefined_1.isNotUndefined);
    }
}
exports.HashNormalizer = HashNormalizer;
class OrganizationalContactNormalizer extends BaseXmlNormalizer {
    normalize(data, options, elementName) {
        return {
            type: 'element',
            name: elementName,
            children: [
                makeOptionalTextElement(data.name, 'name', _xsd_1.normalizedString),
                makeOptionalTextElement(data.email, 'email', _xsd_1.normalizedString),
                makeOptionalTextElement(data.phone, 'phone', _xsd_1.normalizedString)
            ].filter(notUndefined_1.isNotUndefined)
        };
    }
    normalizeIterable(data, options, elementName) {
        return (options.sortLists ?? false
            ? data.sorted()
            : Array.from(data)).map(oc => this.normalize(oc, options, elementName));
    }
}
exports.OrganizationalContactNormalizer = OrganizationalContactNormalizer;
class OrganizationalEntityNormalizer extends BaseXmlNormalizer {
    normalize(data, options, elementName) {
        return {
            type: 'element',
            name: elementName,
            children: [
                makeOptionalTextElement(data.name, 'name', _xsd_1.normalizedString),
                ...makeTextElementIter(Array.from(data.url, (s) => (0, uri_1.escapeUri)(s.toString())), options, 'url').filter(({ children: u }) => types_1.XmlSchema.isAnyURI(u)),
                ...this._factory.makeForOrganizationalContact().normalizeIterable(data.contact, options, 'contact')
            ].filter(notUndefined_1.isNotUndefined)
        };
    }
    normalizeIterable(data, options, elementName) {
        return (options.sortLists ?? false
            ? data.sorted()
            : Array.from(data)).map(oe => this.normalize(oe, options, elementName));
    }
}
exports.OrganizationalEntityNormalizer = OrganizationalEntityNormalizer;
class ComponentNormalizer extends BaseXmlNormalizer {
    normalize(data, options, elementName) {
        const spec = this._factory.spec;
        if (!spec.supportsComponentType(data.type)) {
            return undefined;
        }
        const supplier = data.supplier === undefined
            ? undefined
            : this._factory.makeForOrganizationalEntity().normalize(data.supplier, options, 'supplier');
        const version = (spec.requiresComponentVersion
            ? makeTextElement
            : makeOptionalTextElement)(data.version ?? '', 'version', _xsd_1.normalizedString);
        const hashes = data.hashes.size > 0
            ? {
                type: 'element',
                name: 'hashes',
                children: this._factory.makeForHash().normalizeIterable(data.hashes, options, 'hash')
            }
            : undefined;
        const licenses = data.licenses.size > 0
            ? {
                type: 'element',
                name: 'licenses',
                children: this._factory.makeForLicense().normalizeIterable(data.licenses, options)
            }
            : undefined;
        const swid = data.swid === undefined
            ? undefined
            : this._factory.makeForSWID().normalize(data.swid, options, 'swid');
        const extRefs = data.externalReferences.size > 0
            ? {
                type: 'element',
                name: 'externalReferences',
                children: this._factory.makeForExternalReference().normalizeIterable(data.externalReferences, options, 'reference')
            }
            : undefined;
        const properties = spec.supportsProperties(data) && data.properties.size > 0
            ? {
                type: 'element',
                name: 'properties',
                children: this._factory.makeForProperty().normalizeIterable(data.properties, options, 'property')
            }
            : undefined;
        const components = data.components.size > 0
            ? {
                type: 'element',
                name: 'components',
                children: this.normalizeIterable(data.components, options, 'component')
            }
            : undefined;
        const evidence = spec.supportsComponentEvidence && data.evidence !== undefined
            ? this._factory.makeForComponentEvidence().normalize(data.evidence, options, 'evidence')
            : undefined;
        return {
            type: 'element',
            name: elementName,
            attributes: {
                type: data.type,
                'bom-ref': data.bomRef.value
            },
            children: [
                supplier,
                makeOptionalTextElement(data.author, 'author', _xsd_1.normalizedString),
                makeOptionalTextElement(data.publisher, 'publisher', _xsd_1.normalizedString),
                makeOptionalTextElement(data.group, 'group', _xsd_1.normalizedString),
                makeTextElement(data.name, 'name', _xsd_1.normalizedString),
                version,
                makeOptionalTextElement(data.description, 'description', _xsd_1.normalizedString),
                makeOptionalTextElement(data.scope, 'scope'),
                hashes,
                licenses,
                makeOptionalTextElement(data.copyright, 'copyright', _xsd_1.normalizedString),
                makeOptionalTextElement(data.cpe, 'cpe'),
                makeOptionalTextElement(data.purl, 'purl'),
                swid,
                extRefs,
                properties,
                components,
                evidence
            ].filter(notUndefined_1.isNotUndefined)
        };
    }
    normalizeIterable(data, options, elementName) {
        return (options.sortLists ?? false
            ? data.sorted()
            : Array.from(data)).map(c => this.normalize(c, options, elementName)).filter(notUndefined_1.isNotUndefined);
    }
}
exports.ComponentNormalizer = ComponentNormalizer;
class ServiceNormalizer extends BaseXmlNormalizer {
    normalize(data, options, elementName) {
        const spec = this._factory.spec;
        const provider = data.provider === undefined
            ? undefined
            : this._factory.makeForOrganizationalEntity().normalize(data.provider, options, 'provider');
        const licenses = data.licenses.size > 0
            ? {
                type: 'element',
                name: 'licenses',
                children: this._factory.makeForLicense().normalizeIterable(data.licenses, options)
            }
            : undefined;
        const extRefs = data.externalReferences.size > 0
            ? {
                type: 'element',
                name: 'externalReferences',
                children: this._factory.makeForExternalReference().normalizeIterable(data.externalReferences, options, 'reference')
            }
            : undefined;
        const properties = spec.supportsProperties(data) && data.properties.size > 0
            ? {
                type: 'element',
                name: 'properties',
                children: this._factory.makeForProperty().normalizeIterable(data.properties, options, 'property')
            }
            : undefined;
        const services = data.services.size > 0
            ? {
                type: 'element',
                name: 'services',
                children: this.normalizeIterable(data.services, options, 'service')
            }
            : undefined;
        return {
            type: 'element',
            name: elementName,
            attributes: {
                'bom-ref': data.bomRef.value
            },
            children: [
                provider,
                makeOptionalTextElement(data.group, 'group', _xsd_1.normalizedString),
                makeTextElement(data.name, 'name', _xsd_1.normalizedString),
                makeOptionalTextElement(data.version, 'version', _xsd_1.normalizedString),
                makeOptionalTextElement(data.description, 'description', _xsd_1.normalizedString),
                licenses,
                extRefs,
                properties,
                services,
            ].filter(notUndefined_1.isNotUndefined)
        };
    }
    normalizeIterable(data, options, elementName) {
        return (options.sortLists ?? false
            ? data.sorted()
            : Array.from(data)).map(s => this.normalize(s, options, elementName));
    }
}
exports.ServiceNormalizer = ServiceNormalizer;
class ComponentEvidenceNormalizer extends BaseXmlNormalizer {
    normalize(data, options, elementName) {
        const licenses = data.licenses.size > 0
            ? {
                type: 'element',
                name: 'licenses',
                children: this._factory.makeForLicense().normalizeIterable(data.licenses, options)
            }
            : undefined;
        const copyright = data.copyright.size > 0
            ? {
                type: 'element',
                name: 'copyright',
                children: makeTextElementIter(data.copyright, options, 'text')
            }
            : undefined;
        return {
            type: 'element',
            name: elementName,
            children: [
                licenses,
                copyright
            ].filter(notUndefined_1.isNotUndefined)
        };
    }
}
exports.ComponentEvidenceNormalizer = ComponentEvidenceNormalizer;
class LicenseNormalizer extends BaseXmlNormalizer {
    normalize(data, options) {
        switch (true) {
            case data instanceof license_1.NamedLicense:
                return this.#normalizeNamedLicense(data, options);
            case data instanceof license_1.SpdxLicense:
                return (0, spdx_1.isSupportedSpdxId)(data.id)
                    ? this.#normalizeSpdxLicense(data, options)
                    : this.#normalizeNamedLicense(new license_1.NamedLicense(data.id, { url: data.url }), options);
            case data instanceof license_1.LicenseExpression:
                return this.#normalizeLicenseExpression(data);
            default:
                throw new TypeError('Unexpected LicenseChoice');
        }
    }
    #normalizeNamedLicense(data, options) {
        const spec = this._factory.spec;
        const url = (0, uri_1.escapeUri)(data.url?.toString());
        const properties = spec.supportsProperties(data) && data.properties.size > 0
            ? {
                type: 'element',
                name: 'properties',
                children: this._factory.makeForProperty().normalizeIterable(data.properties, options, 'property')
            }
            : undefined;
        return {
            type: 'element',
            name: 'license',
            attributes: {
                acknowledgement: spec.supportsLicenseAcknowledgement
                    ? data.acknowledgement
                    : undefined
            },
            children: [
                makeTextElement(data.name, 'name', _xsd_1.normalizedString),
                data.text === undefined
                    ? undefined
                    : this._factory.makeForAttachment().normalize(data.text, options, 'text'),
                types_1.XmlSchema.isAnyURI(url)
                    ? makeTextElement(url, 'url')
                    : undefined,
                properties
            ].filter(notUndefined_1.isNotUndefined)
        };
    }
    #normalizeSpdxLicense(data, options) {
        const spec = this._factory.spec;
        const url = (0, uri_1.escapeUri)(data.url?.toString());
        const properties = spec.supportsProperties(data) && data.properties.size > 0
            ? {
                type: 'element',
                name: 'properties',
                children: this._factory.makeForProperty().normalizeIterable(data.properties, options, 'property')
            }
            : undefined;
        return {
            type: 'element',
            name: 'license',
            attributes: {
                acknowledgement: spec.supportsLicenseAcknowledgement
                    ? data.acknowledgement
                    : undefined
            },
            children: [
                makeTextElement(data.id, 'id'),
                data.text === undefined
                    ? undefined
                    : this._factory.makeForAttachment().normalize(data.text, options, 'text'),
                types_1.XmlSchema.isAnyURI(url)
                    ? makeTextElement(url, 'url')
                    : undefined,
                properties
            ].filter(notUndefined_1.isNotUndefined)
        };
    }
    #normalizeLicenseExpression(data) {
        const elem = makeTextElement(data.expression, 'expression', _xsd_1.normalizedString);
        elem.attributes = {
            acknowledgement: this._factory.spec.supportsLicenseAcknowledgement
                ? data.acknowledgement
                : undefined
        };
        return elem;
    }
    normalizeIterable(data, options) {
        const licenses = options.sortLists ?? false
            ? data.sorted()
            : Array.from(data);
        if (licenses.length > 1) {
            const expressions = licenses.filter(l => l instanceof license_1.LicenseExpression);
            if (expressions.length > 0) {
                return [this.#normalizeLicenseExpression(expressions[0])];
            }
        }
        return licenses.map(l => this.normalize(l, options));
    }
}
exports.LicenseNormalizer = LicenseNormalizer;
class SWIDNormalizer extends BaseXmlNormalizer {
    normalize(data, options, elementName) {
        const url = (0, uri_1.escapeUri)(data.url?.toString());
        return {
            type: 'element',
            name: elementName,
            attributes: {
                tagId: data.tagId,
                name: data.name,
                version: data.version || undefined,
                tagVersion: data.tagVersion,
                patch: data.patch === undefined
                    ? undefined
                    : (data.patch ? 'true' : 'false')
            },
            children: [
                data.text === undefined
                    ? undefined
                    : this._factory.makeForAttachment().normalize(data.text, options, 'text'),
                types_1.XmlSchema.isAnyURI(url)
                    ? makeTextElement(url, 'url')
                    : undefined
            ].filter(notUndefined_1.isNotUndefined)
        };
    }
}
exports.SWIDNormalizer = SWIDNormalizer;
class ExternalReferenceNormalizer extends BaseXmlNormalizer {
    normalize(data, options, elementName) {
        const url = (0, uri_1.escapeUri)(data.url.toString());
        const hashes = this._factory.spec.supportsExternalReferenceHashes && data.hashes.size > 0
            ? {
                type: 'element',
                name: 'hashes',
                children: this._factory.makeForHash().normalizeIterable(data.hashes, options, 'hash')
            }
            : undefined;
        return this._factory.spec.supportsExternalReferenceType(data.type) &&
            types_1.XmlSchema.isAnyURI(url)
            ? {
                type: 'element',
                name: elementName,
                attributes: {
                    type: data.type
                },
                children: [
                    makeTextElement(url, 'url'),
                    makeOptionalTextElement(data.comment, 'comment'),
                    hashes
                ].filter(notUndefined_1.isNotUndefined)
            }
            : undefined;
    }
    normalizeIterable(data, options, elementName) {
        return (options.sortLists ?? false
            ? data.sorted()
            : Array.from(data)).map(r => this.normalize(r, options, elementName)).filter(notUndefined_1.isNotUndefined);
    }
}
exports.ExternalReferenceNormalizer = ExternalReferenceNormalizer;
class AttachmentNormalizer extends BaseXmlNormalizer {
    normalize(data, options, elementName) {
        return {
            type: 'element',
            name: elementName,
            attributes: {
                'content-type': data.contentType
                    ? (0, _xsd_1.normalizedString)(data.contentType)
                    : undefined,
                encoding: data.encoding || undefined
            },
            children: data.content.toString()
        };
    }
}
exports.AttachmentNormalizer = AttachmentNormalizer;
class PropertyNormalizer extends BaseXmlNormalizer {
    normalize(data, options, elementName) {
        return {
            type: 'element',
            name: elementName,
            attributes: {
                name: data.name
            },
            children: (0, _xsd_1.normalizedString)(data.value)
        };
    }
    normalizeIterable(data, options, elementName) {
        return (options.sortLists ?? false
            ? data.sorted()
            : Array.from(data)).map(p => this.normalize(p, options, elementName));
    }
}
exports.PropertyNormalizer = PropertyNormalizer;
class DependencyGraphNormalizer extends BaseXmlNormalizer {
    normalize(data, options, elementName) {
        const allRefs = new Map();
        if (data.metadata.component !== undefined) {
            allRefs.set(data.metadata.component.bomRef, data.metadata.component.dependencies);
            for (const component of data.metadata.component.components[tree_1.treeIteratorSymbol]()) {
                allRefs.set(component.bomRef, component.dependencies);
            }
        }
        for (const component of data.components[tree_1.treeIteratorSymbol]()) {
            allRefs.set(component.bomRef, component.dependencies);
        }
        for (const service of data.services[tree_1.treeIteratorSymbol]()) {
            allRefs.set(service.bomRef, service.dependencies);
        }
        const normalized = [];
        for (const [ref, deps] of allRefs) {
            const dep = this.#normalizeDependency(ref, deps, allRefs, options);
            if ((0, notUndefined_1.isNotUndefined)(dep)) {
                normalized.push(dep);
            }
        }
        if (options.sortLists ?? false) {
            normalized.sort(({ attributes: { ref: a } }, { attributes: { ref: b } }) => a.localeCompare(b));
        }
        return {
            type: 'element',
            name: elementName,
            children: normalized
        };
    }
    #normalizeDependency(ref, deps, allRefs, options) {
        const bomRef = ref.toString();
        if (bomRef.length === 0) {
            return undefined;
        }
        const dependsOn = Array.from(deps).filter(d => allRefs.has(d) && d !== ref)
            .map(d => d.toString()).filter(d => d.length > 0);
        if (options.sortLists ?? false) {
            dependsOn.sort((a, b) => a.localeCompare(b));
        }
        return {
            type: 'element',
            name: 'dependency',
            attributes: { ref: bomRef },
            children: dependsOn.map(d => ({
                type: 'element',
                name: 'dependency',
                attributes: { ref: d }
            }))
        };
    }
}
exports.DependencyGraphNormalizer = DependencyGraphNormalizer;
class VulnerabilityNormalizer extends BaseXmlNormalizer {
    normalize(data, options, elementName) {
        const references = data.references.size > 0
            ? {
                type: 'element',
                name: 'references',
                children: this._factory.makeForVulnerabilityReference().normalizeIterable(data.references, options, 'reference')
            }
            : undefined;
        const ratings = data.ratings.size > 0
            ? {
                type: 'element',
                name: 'ratings',
                children: this._factory.makeForVulnerabilityRating().normalizeIterable(data.ratings, options, 'rating')
            }
            : undefined;
        const cwes = data.cwes.size > 0
            ? {
                type: 'element',
                name: 'cwes',
                children: (options.sortLists
                    ? data.cwes.sorted()
                    : Array.from(data.cwes)).map(cwe => makeTextElement(cwe, 'cwe'))
            }
            : undefined;
        const advisories = data.advisories.size > 0
            ? {
                type: 'element',
                name: 'advisories',
                children: this._factory.makeForVulnerabilityAdvisory().normalizeIterable(data.advisories, options, 'advisory')
            }
            : undefined;
        const tools = data.tools.size > 0
            ? this._factory.makeForTools().normalize(data.tools, options, 'tools')
            : undefined;
        const affects = data.affects.size > 0
            ? {
                type: 'element',
                name: 'affects',
                children: this._factory.makeForVulnerabilityAffect().normalizeIterable(data.affects, options, 'target')
            }
            : undefined;
        const properties = data.properties.size > 0
            ? {
                type: 'element',
                name: 'properties',
                children: this._factory.makeForProperty().normalizeIterable(data.properties, options, 'property')
            }
            : undefined;
        return {
            type: 'element',
            name: elementName,
            attributes: { 'bom-ref': data.bomRef.value || undefined },
            children: [
                makeOptionalTextElement(data.id, 'id', _xsd_1.normalizedString),
                data.source === undefined
                    ? undefined
                    : this._factory.makeForVulnerabilitySource().normalize(data.source, options, 'source'),
                references,
                ratings,
                cwes,
                makeOptionalTextElement(data.description, 'description'),
                makeOptionalTextElement(data.detail, 'detail'),
                makeOptionalTextElement(data.recommendation, 'recommendation'),
                advisories,
                makeOptionalDateTimeElement(data.created, 'created'),
                makeOptionalDateTimeElement(data.created, 'published'),
                makeOptionalDateTimeElement(data.created, 'updated'),
                data.credits === undefined
                    ? undefined
                    : this._factory.makeForVulnerabilityCredits().normalize(data.credits, options, 'credits'),
                tools,
                data.analysis === undefined
                    ? undefined
                    : this._factory.makeForVulnerabilityAnalysis().normalize(data.analysis, options, 'analysis'),
                affects,
                properties
            ].filter(notUndefined_1.isNotUndefined)
        };
    }
    normalizeIterable(data, options, elementName) {
        return (options.sortLists ?? false
            ? data.sorted()
            : Array.from(data)).map(v => this.normalize(v, options, elementName));
    }
}
exports.VulnerabilityNormalizer = VulnerabilityNormalizer;
class VulnerabilitySourceNormalizer extends BaseXmlNormalizer {
    normalize(data, options, elementName) {
        const url = (0, uri_1.escapeUri)(data.url?.toString());
        return {
            type: 'element',
            name: elementName,
            children: [
                makeOptionalTextElement(data.name, 'name', _xsd_1.normalizedString),
                types_1.XmlSchema.isAnyURI(url)
                    ? makeTextElement(url, 'url')
                    : undefined
            ].filter(notUndefined_1.isNotUndefined)
        };
    }
}
exports.VulnerabilitySourceNormalizer = VulnerabilitySourceNormalizer;
class VulnerabilityReferenceNormalizer extends BaseXmlNormalizer {
    normalize(data, options, elementName) {
        return {
            type: 'element',
            name: elementName,
            children: [
                makeTextElement(data.id, 'id'),
                this._factory.makeForVulnerabilitySource().normalize(data.source, options, 'source')
            ]
        };
    }
    normalizeIterable(data, options, elementName) {
        return (options.sortLists ?? false
            ? data.sorted()
            : Array.from(data)).map(r => this.normalize(r, options, elementName));
    }
}
exports.VulnerabilityReferenceNormalizer = VulnerabilityReferenceNormalizer;
class VulnerabilityRatingNormalizer extends BaseXmlNormalizer {
    normalize(data, options, elementName) {
        return {
            type: 'element',
            name: elementName,
            children: [
                data.source === undefined
                    ? undefined
                    : this._factory.makeForVulnerabilitySource().normalize(data.source, options, 'source'),
                makeOptionalTextElement(data.score, 'score'),
                makeOptionalTextElement(data.severity, 'severity'),
                this._factory.spec.supportsVulnerabilityRatingMethod(data.method)
                    ? makeOptionalTextElement(data.method, 'method')
                    : undefined,
                makeOptionalTextElement(data.vector, 'vector', _xsd_1.normalizedString),
                makeOptionalTextElement(data.justification, 'justification')
            ].filter(notUndefined_1.isNotUndefined)
        };
    }
    normalizeIterable(data, options, elementName) {
        return (options.sortLists ?? false
            ? data.sorted()
            : Array.from(data)).map(r => this.normalize(r, options, elementName));
    }
}
exports.VulnerabilityRatingNormalizer = VulnerabilityRatingNormalizer;
class VulnerabilityAdvisoryNormalizer extends BaseXmlNormalizer {
    normalize(data, options, elementName) {
        const url = (0, uri_1.escapeUri)(data.url.toString());
        if (!types_1.XmlSchema.isAnyURI(url)) {
            return undefined;
        }
        return {
            type: 'element',
            name: elementName,
            children: [
                makeOptionalTextElement(data.title, 'title'),
                makeTextElement(url, 'url')
            ].filter(notUndefined_1.isNotUndefined)
        };
    }
    normalizeIterable(data, options, elementName) {
        return (options.sortLists ?? false
            ? data.sorted()
            : Array.from(data)).map(a => this.normalize(a, options, elementName)).filter(notUndefined_1.isNotUndefined);
    }
}
exports.VulnerabilityAdvisoryNormalizer = VulnerabilityAdvisoryNormalizer;
class VulnerabilityCreditsNormalizer extends BaseXmlNormalizer {
    normalize(data, options, elementName) {
        const organizations = data.organizations.size > 0
            ? {
                type: 'element',
                name: 'organizations',
                children: this._factory.makeForOrganizationalEntity().normalizeIterable(data.organizations, options, 'organization')
            }
            : undefined;
        const individuals = data.individuals.size > 0
            ? {
                type: 'element',
                name: 'individuals',
                children: this._factory.makeForOrganizationalContact().normalizeIterable(data.individuals, options, 'individual')
            }
            : undefined;
        return {
            type: 'element',
            name: elementName,
            children: [
                organizations,
                individuals
            ].filter(notUndefined_1.isNotUndefined)
        };
    }
}
exports.VulnerabilityCreditsNormalizer = VulnerabilityCreditsNormalizer;
class VulnerabilityAnalysisNormalizer extends BaseXmlNormalizer {
    normalize(data, options, elementName) {
        const responses = data.response.size > 0
            ? {
                type: 'element',
                name: 'responses',
                children: (options.sortLists ?? false
                    ? data.response.sorted()
                    : Array.from(data.response)).map(ar => makeTextElement(ar, 'response'))
            }
            : undefined;
        return {
            type: 'element',
            name: elementName,
            children: [
                makeOptionalTextElement(data.state, 'state'),
                makeOptionalTextElement(data.justification, 'justification'),
                responses,
                makeOptionalTextElement(data.detail, 'detail')
            ].filter(notUndefined_1.isNotUndefined)
        };
    }
}
exports.VulnerabilityAnalysisNormalizer = VulnerabilityAnalysisNormalizer;
class VulnerabilityAffectNormalizer extends BaseXmlNormalizer {
    normalize(data, options, elementName) {
        const versions = data.versions.size > 0
            ? {
                type: 'element',
                name: 'versions',
                children: this._factory.makeForVulnerabilityAffectedVersion().normalizeIterable(data.versions, options, 'version')
            }
            : undefined;
        return {
            type: 'element',
            name: elementName,
            children: [
                makeTextElement(data.ref, 'ref'),
                versions
            ].filter(notUndefined_1.isNotUndefined)
        };
    }
    normalizeIterable(data, options, elementName) {
        return (options.sortLists ?? false
            ? data.sorted()
            : Array.from(data)).map(a => this.normalize(a, options, elementName));
    }
}
exports.VulnerabilityAffectNormalizer = VulnerabilityAffectNormalizer;
class VulnerabilityAffectedVersionNormalizer extends BaseXmlNormalizer {
    normalize(data, options, elementName) {
        switch (true) {
            case data instanceof affect_1.AffectedSingleVersion:
                return this.#normalizeAffectedSingleVersion(data, elementName);
            case data instanceof affect_1.AffectedVersionRange:
                return this.#normalizeAffectedVersionRange(data, elementName);
            default:
                throw new TypeError('Unexpected Vulnerability AffectedVersion');
        }
    }
    #normalizeAffectedSingleVersion(data, elementName) {
        return {
            type: 'element',
            name: elementName,
            children: [
                makeTextElement(data.version, 'version', _xsd_1.normalizedString),
                makeOptionalTextElement(data.status, 'status')
            ].filter(notUndefined_1.isNotUndefined)
        };
    }
    #normalizeAffectedVersionRange(data, elementName) {
        return {
            type: 'element',
            name: elementName,
            children: [
                makeTextElement(data.range, 'range', _xsd_1.normalizedString),
                makeOptionalTextElement(data.status, 'status')
            ].filter(notUndefined_1.isNotUndefined)
        };
    }
    normalizeIterable(data, options, elementName) {
        return (options.sortLists ?? false
            ? data.sorted()
            : Array.from(data)).map(av => this.normalize(av, options, elementName));
    }
}
exports.VulnerabilityAffectedVersionNormalizer = VulnerabilityAffectedVersionNormalizer;
const noTEM = (s) => s;
function makeOptionalTextElement(data, elementName, mod = noTEM) {
    const s = mod(data?.toString() ?? '');
    return s.length > 0
        ? makeTextElement(s, elementName)
        : undefined;
}
function makeTextElement(data, elementName, mod = noTEM) {
    return {
        type: 'element',
        name: elementName,
        children: mod(data.toString())
    };
}
function makeTextElementIter(data, options, elementName, mod = noTEM) {
    const r = Array.from(data, d => makeTextElement(d, elementName, mod));
    if (options.sortLists ?? false) {
        r.sort(({ children: a }, { children: b }) => a.localeCompare(b));
    }
    return r;
}
function makeOptionalDateTimeElement(data, elementName, mod = noTEM) {
    const d = data?.toISOString();
    return d === undefined
        ? undefined
        : makeTextElement(d, elementName, mod);
}
//# sourceMappingURL=normalize.js.map

},
73834(__unused_rspack_module, exports) {

/*!
This file is part of CycloneDX JavaScript Library.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

   http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.

SPDX-License-Identifier: Apache-2.0
Copyright (c) OWASP Foundation. All Rights Reserved.
*/
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.XmlSchema = void 0;
var XmlSchema;
(function (XmlSchema) {
    const _AnyUriSchemePattern = /^[a-z][a-z0-9+\-.]*$/i;
    function isAnyURI(value) {
        if (typeof value !== 'string') {
            return false;
        }
        if (value.length === 0) {
            return false;
        }
        const fragmentPos = value.indexOf('#');
        let beforeFragment = value;
        if (fragmentPos >= 0) {
            if (value.includes('#', fragmentPos + 1)) {
                return false;
            }
            beforeFragment = value.slice(undefined, fragmentPos);
        }
        const schemePos = beforeFragment.indexOf(':');
        if (schemePos >= 0) {
            if (!_AnyUriSchemePattern.test(beforeFragment.slice(undefined, schemePos))) {
                return false;
            }
        }
        return true;
    }
    XmlSchema.isAnyURI = isAnyURI;
})(XmlSchema || (exports.XmlSchema = XmlSchema = {}));
//# sourceMappingURL=types.js.map

},
69945(__unused_rspack_module, exports, __webpack_require__) {

/*!
This file is part of CycloneDX JavaScript Library.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

   http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.

SPDX-License-Identifier: Apache-2.0
Copyright (c) OWASP Foundation. All Rights Reserved.
*/
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.XmlBaseSerializer = void 0;
const enums_1 = __webpack_require__(45928);
const errors_1 = __webpack_require__(22679);
const baseSerializer_1 = __webpack_require__(13232);
class XmlBaseSerializer extends baseSerializer_1.BaseSerializer {
    #normalizerFactory;
    constructor(normalizerFactory) {
        if (!normalizerFactory.spec.supportsFormat(enums_1.Format.XML)) {
            throw new errors_1.UnsupportedFormatError('Spec does not support XML format.');
        }
        super();
        this.#normalizerFactory = normalizerFactory;
    }
    get normalizerFactory() {
        return this.#normalizerFactory;
    }
    _normalize(bom, options = {}) {
        return this.#normalizerFactory.makeForBom()
            .normalize(bom, options);
    }
}
exports.XmlBaseSerializer = XmlBaseSerializer;
//# sourceMappingURL=xmlBaseSerializer.js.map

},
93708(__unused_rspack_module, exports, __webpack_require__) {

/*!
This file is part of CycloneDX JavaScript Library.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

   http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.

SPDX-License-Identifier: Apache-2.0
Copyright (c) OWASP Foundation. All Rights Reserved.
*/
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.XmlSerializer = void 0;
const errors_1 = __webpack_require__(56296);
const xmlStringify_1 = __importDefault(__webpack_require__(88021));
const errors_2 = __webpack_require__(92934);
const xmlBaseSerializer_1 = __webpack_require__(69945);
class XmlSerializer extends xmlBaseSerializer_1.XmlBaseSerializer {
    _serialize(normalizedBom, options = {}) {
        try {
            return (0, xmlStringify_1.default)(normalizedBom, options);
        }
        catch (err) {
            if (err instanceof errors_1.OptPlugError) {
                throw new errors_2.MissingOptionalDependencyError(err.message, err);
            }
            throw err;
        }
    }
}
exports.XmlSerializer = XmlSerializer;
//# sourceMappingURL=xmlSerializer.node.js.map

},
97517(__unused_rspack_module, exports, __webpack_require__) {

/*!
This file is part of CycloneDX JavaScript Library.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

   http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.

SPDX-License-Identifier: Apache-2.0
Copyright (c) OWASP Foundation. All Rights Reserved.
*/
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.isSupportedSpdxId = isSupportedSpdxId;
exports.fixupSpdxId = fixupSpdxId;
const spdx_SNAPSHOT_schema_json_1 = __webpack_require__(33570);
const spdxIds = new Set(spdx_SNAPSHOT_schema_json_1.enum);
const spdxLowerToActual = Object.freeze(Object.fromEntries(spdx_SNAPSHOT_schema_json_1.enum.map(spdxId => [spdxId.toLowerCase(), spdxId])));
function isSupportedSpdxId(value) {
    return spdxIds.has(value);
}
function fixupSpdxId(value) {
    return typeof value === 'string' && value.length > 0
        ? spdxLowerToActual[value.toLowerCase()]
        : undefined;
}
//# sourceMappingURL=spdx.js.map

},
77751(__unused_rspack_module, exports, __webpack_require__) {
var __webpack_unused_export__;

/*!
This file is part of CycloneDX JavaScript Library.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

   http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.

SPDX-License-Identifier: Apache-2.0
Copyright (c) OWASP Foundation. All Rights Reserved.
*/
__webpack_unused_export__ = ({ value: true });
exports._Spec = void 0;
const models_1 = __webpack_require__(59431);
class _Spec {
    #version;
    #formats;
    #componentTypes;
    #hashAlgorithms;
    #hashValuePattern;
    #externalReferenceTypes;
    #vulnerabilityRatingMethods;
    #supportsDependencyGraph;
    #supportsToolReferences;
    #requiresComponentVersion;
    #supportsProperties;
    #supportsVulnerabilities;
    #supportsComponentEvidence;
    #supportsMetadataLifecycles;
    #supportsMetadataLicenses;
    #supportsMetadataProperties;
    #supportsExternalReferenceHashes;
    #supportsLicenseAcknowledgement;
    #supportsServices;
    #supportsToolsComponentsServices;
    #supportsLicenseProperties;
    constructor(version, formats, componentTypes, hashAlgorithms, hashValuePattern, externalReferenceTypes, supportsDependencyGraph, supportsToolReferences, requiresComponentVersion, supportsProperties, supportsVulnerabilities, vulnerabilityRatingMethods, supportsComponentEvidence, supportsMetadataLifecycles, supportsMetadataLicenses, supportsMetadataProperties, supportsExternalReferenceHashes, supportsLicenseAcknowledgement, supportsServices, supportsToolsComponentsServices, supportsLicenseProperties) {
        this.#version = version;
        this.#formats = new Set(formats);
        this.#componentTypes = new Set(componentTypes);
        this.#hashAlgorithms = new Set(hashAlgorithms);
        this.#hashValuePattern = hashValuePattern;
        this.#externalReferenceTypes = new Set(externalReferenceTypes);
        this.#supportsDependencyGraph = supportsDependencyGraph;
        this.#supportsToolReferences = supportsToolReferences;
        this.#requiresComponentVersion = requiresComponentVersion;
        this.#supportsProperties = supportsProperties;
        this.#supportsVulnerabilities = supportsVulnerabilities;
        this.#vulnerabilityRatingMethods = new Set(vulnerabilityRatingMethods);
        this.#supportsComponentEvidence = supportsComponentEvidence;
        this.#supportsMetadataLifecycles = supportsMetadataLifecycles;
        this.#supportsMetadataLicenses = supportsMetadataLicenses;
        this.#supportsMetadataProperties = supportsMetadataProperties;
        this.#supportsExternalReferenceHashes = supportsExternalReferenceHashes;
        this.#supportsLicenseAcknowledgement = supportsLicenseAcknowledgement;
        this.#supportsServices = supportsServices;
        this.#supportsToolsComponentsServices = supportsToolsComponentsServices;
        this.#supportsLicenseProperties = supportsLicenseProperties;
    }
    get version() {
        return this.#version;
    }
    supportsFormat(f) {
        return this.#formats.has(f);
    }
    supportsComponentType(ct) {
        return this.#componentTypes.has(ct);
    }
    supportsHashAlgorithm(ha) {
        return this.#hashAlgorithms.has(ha);
    }
    supportsHashValue(hv) {
        return typeof hv === 'string' &&
            this.#hashValuePattern.test(hv);
    }
    supportsExternalReferenceType(ert) {
        return this.#externalReferenceTypes.has(ert);
    }
    get supportsDependencyGraph() {
        return this.#supportsDependencyGraph;
    }
    get supportsToolReferences() {
        return this.#supportsToolReferences;
    }
    get requiresComponentVersion() {
        return this.#requiresComponentVersion;
    }
    supportsProperties(model) {
        switch (true) {
            case model instanceof models_1.NamedLicense || model instanceof models_1.SpdxLicense:
                return this.#supportsLicenseProperties;
            default:
                return this.#supportsProperties;
        }
    }
    get supportsVulnerabilities() {
        return this.#supportsVulnerabilities;
    }
    supportsVulnerabilityRatingMethod(rm) {
        return this.#vulnerabilityRatingMethods.has(rm);
    }
    get supportsComponentEvidence() {
        return this.#supportsComponentEvidence;
    }
    get supportsMetadataLifecycles() {
        return this.#supportsMetadataLifecycles;
    }
    get supportsMetadataLicenses() {
        return this.#supportsMetadataLicenses;
    }
    get supportsMetadataProperties() {
        return this.#supportsMetadataProperties;
    }
    get supportsExternalReferenceHashes() {
        return this.#supportsExternalReferenceHashes;
    }
    get supportsLicenseAcknowledgement() {
        return this.#supportsLicenseAcknowledgement;
    }
    get supportsServices() {
        return this.#supportsServices;
    }
    get supportsToolsComponentsServices() {
        return this.#supportsToolsComponentsServices;
    }
}
exports._Spec = _Spec;
//# sourceMappingURL=_protocol.js.map

},
25596(__unused_rspack_module, exports, __webpack_require__) {

/*!
This file is part of CycloneDX JavaScript Library.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

   http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.

SPDX-License-Identifier: Apache-2.0
Copyright (c) OWASP Foundation. All Rights Reserved.
*/
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.SpecVersionDict = exports.Spec1dot7 = exports.Spec1dot6 = exports.Spec1dot5 = exports.Spec1dot4 = exports.Spec1dot3 = exports.Spec1dot2 = void 0;
const componentType_1 = __webpack_require__(83714);
const externalReferenceType_1 = __webpack_require__(78193);
const hashAlogorithm_1 = __webpack_require__(65065);
const ratingMethod_1 = __webpack_require__(47634);
const _protocol_1 = __webpack_require__(77751);
const enums_1 = __webpack_require__(45928);
exports.Spec1dot2 = Object.freeze(new _protocol_1._Spec(enums_1.Version.v1dot2, [
    enums_1.Format.XML,
    enums_1.Format.JSON
], [
    componentType_1.ComponentType.Application,
    componentType_1.ComponentType.Framework,
    componentType_1.ComponentType.Library,
    componentType_1.ComponentType.Container,
    componentType_1.ComponentType.OperatingSystem,
    componentType_1.ComponentType.Device,
    componentType_1.ComponentType.Firmware,
    componentType_1.ComponentType.File
], [
    hashAlogorithm_1.HashAlgorithm.MD5,
    hashAlogorithm_1.HashAlgorithm['SHA-1'],
    hashAlogorithm_1.HashAlgorithm['SHA-256'],
    hashAlogorithm_1.HashAlgorithm['SHA-384'],
    hashAlogorithm_1.HashAlgorithm['SHA-512'],
    hashAlogorithm_1.HashAlgorithm['SHA3-256'],
    hashAlogorithm_1.HashAlgorithm['SHA3-384'],
    hashAlogorithm_1.HashAlgorithm['SHA3-512'],
    hashAlogorithm_1.HashAlgorithm['BLAKE2b-256'],
    hashAlogorithm_1.HashAlgorithm['BLAKE2b-384'],
    hashAlogorithm_1.HashAlgorithm['BLAKE2b-512'],
    hashAlogorithm_1.HashAlgorithm.BLAKE3
], /^([a-fA-F0-9]{32})$|^([a-fA-F0-9]{40})$|^([a-fA-F0-9]{64})$|^([a-fA-F0-9]{96})$|^([a-fA-F0-9]{128})$/, [
    externalReferenceType_1.ExternalReferenceType.VCS,
    externalReferenceType_1.ExternalReferenceType.IssueTracker,
    externalReferenceType_1.ExternalReferenceType.Website,
    externalReferenceType_1.ExternalReferenceType.Advisories,
    externalReferenceType_1.ExternalReferenceType.BOM,
    externalReferenceType_1.ExternalReferenceType.MailingList,
    externalReferenceType_1.ExternalReferenceType.Social,
    externalReferenceType_1.ExternalReferenceType.Chat,
    externalReferenceType_1.ExternalReferenceType.Documentation,
    externalReferenceType_1.ExternalReferenceType.Support,
    externalReferenceType_1.ExternalReferenceType.Distribution,
    externalReferenceType_1.ExternalReferenceType.License,
    externalReferenceType_1.ExternalReferenceType.BuildMeta,
    externalReferenceType_1.ExternalReferenceType.BuildSystem,
    externalReferenceType_1.ExternalReferenceType.Other
], true, false, true, false, false, [], false, false, false, false, false, false, true, false, false));
exports.Spec1dot3 = Object.freeze(new _protocol_1._Spec(enums_1.Version.v1dot3, [
    enums_1.Format.XML,
    enums_1.Format.JSON
], [
    componentType_1.ComponentType.Application,
    componentType_1.ComponentType.Framework,
    componentType_1.ComponentType.Library,
    componentType_1.ComponentType.Container,
    componentType_1.ComponentType.OperatingSystem,
    componentType_1.ComponentType.Device,
    componentType_1.ComponentType.Firmware,
    componentType_1.ComponentType.File
], [
    hashAlogorithm_1.HashAlgorithm.MD5,
    hashAlogorithm_1.HashAlgorithm['SHA-1'],
    hashAlogorithm_1.HashAlgorithm['SHA-256'],
    hashAlogorithm_1.HashAlgorithm['SHA-384'],
    hashAlogorithm_1.HashAlgorithm['SHA-512'],
    hashAlogorithm_1.HashAlgorithm['SHA3-256'],
    hashAlogorithm_1.HashAlgorithm['SHA3-384'],
    hashAlogorithm_1.HashAlgorithm['SHA3-512'],
    hashAlogorithm_1.HashAlgorithm['BLAKE2b-256'],
    hashAlogorithm_1.HashAlgorithm['BLAKE2b-384'],
    hashAlogorithm_1.HashAlgorithm['BLAKE2b-512'],
    hashAlogorithm_1.HashAlgorithm.BLAKE3
], /^([a-fA-F0-9]{32})$|^([a-fA-F0-9]{40})$|^([a-fA-F0-9]{64})$|^([a-fA-F0-9]{96})$|^([a-fA-F0-9]{128})$/, [
    externalReferenceType_1.ExternalReferenceType.VCS,
    externalReferenceType_1.ExternalReferenceType.IssueTracker,
    externalReferenceType_1.ExternalReferenceType.Website,
    externalReferenceType_1.ExternalReferenceType.Advisories,
    externalReferenceType_1.ExternalReferenceType.BOM,
    externalReferenceType_1.ExternalReferenceType.MailingList,
    externalReferenceType_1.ExternalReferenceType.Social,
    externalReferenceType_1.ExternalReferenceType.Chat,
    externalReferenceType_1.ExternalReferenceType.Documentation,
    externalReferenceType_1.ExternalReferenceType.Support,
    externalReferenceType_1.ExternalReferenceType.Distribution,
    externalReferenceType_1.ExternalReferenceType.License,
    externalReferenceType_1.ExternalReferenceType.BuildMeta,
    externalReferenceType_1.ExternalReferenceType.BuildSystem,
    externalReferenceType_1.ExternalReferenceType.Other
], true, false, true, true, false, [], true, false, true, true, true, false, true, false, false));
exports.Spec1dot4 = Object.freeze(new _protocol_1._Spec(enums_1.Version.v1dot4, [
    enums_1.Format.XML,
    enums_1.Format.JSON
], [
    componentType_1.ComponentType.Application,
    componentType_1.ComponentType.Framework,
    componentType_1.ComponentType.Library,
    componentType_1.ComponentType.Container,
    componentType_1.ComponentType.OperatingSystem,
    componentType_1.ComponentType.Device,
    componentType_1.ComponentType.Firmware,
    componentType_1.ComponentType.File
], [
    hashAlogorithm_1.HashAlgorithm.MD5,
    hashAlogorithm_1.HashAlgorithm['SHA-1'],
    hashAlogorithm_1.HashAlgorithm['SHA-256'],
    hashAlogorithm_1.HashAlgorithm['SHA-384'],
    hashAlogorithm_1.HashAlgorithm['SHA-512'],
    hashAlogorithm_1.HashAlgorithm['SHA3-256'],
    hashAlogorithm_1.HashAlgorithm['SHA3-384'],
    hashAlogorithm_1.HashAlgorithm['SHA3-512'],
    hashAlogorithm_1.HashAlgorithm['BLAKE2b-256'],
    hashAlogorithm_1.HashAlgorithm['BLAKE2b-384'],
    hashAlogorithm_1.HashAlgorithm['BLAKE2b-512'],
    hashAlogorithm_1.HashAlgorithm.BLAKE3
], /^([a-fA-F0-9]{32})$|^([a-fA-F0-9]{40})$|^([a-fA-F0-9]{64})$|^([a-fA-F0-9]{96})$|^([a-fA-F0-9]{128})$/, [
    externalReferenceType_1.ExternalReferenceType.VCS,
    externalReferenceType_1.ExternalReferenceType.IssueTracker,
    externalReferenceType_1.ExternalReferenceType.Website,
    externalReferenceType_1.ExternalReferenceType.Advisories,
    externalReferenceType_1.ExternalReferenceType.BOM,
    externalReferenceType_1.ExternalReferenceType.MailingList,
    externalReferenceType_1.ExternalReferenceType.Social,
    externalReferenceType_1.ExternalReferenceType.Chat,
    externalReferenceType_1.ExternalReferenceType.Documentation,
    externalReferenceType_1.ExternalReferenceType.Support,
    externalReferenceType_1.ExternalReferenceType.Distribution,
    externalReferenceType_1.ExternalReferenceType.License,
    externalReferenceType_1.ExternalReferenceType.BuildMeta,
    externalReferenceType_1.ExternalReferenceType.BuildSystem,
    externalReferenceType_1.ExternalReferenceType.ReleaseNotes,
    externalReferenceType_1.ExternalReferenceType.Other
], true, true, false, true, true, [
    ratingMethod_1.RatingMethod.CVSSv2,
    ratingMethod_1.RatingMethod.CVSSv3,
    ratingMethod_1.RatingMethod.CVSSv31,
    ratingMethod_1.RatingMethod.OWASP,
    ratingMethod_1.RatingMethod.Other
], true, false, true, true, true, false, true, false, false));
exports.Spec1dot5 = Object.freeze(new _protocol_1._Spec(enums_1.Version.v1dot5, [
    enums_1.Format.XML,
    enums_1.Format.JSON
], [
    componentType_1.ComponentType.Application,
    componentType_1.ComponentType.Framework,
    componentType_1.ComponentType.Library,
    componentType_1.ComponentType.Container,
    componentType_1.ComponentType.Platform,
    componentType_1.ComponentType.OperatingSystem,
    componentType_1.ComponentType.Device,
    componentType_1.ComponentType.DeviceDriver,
    componentType_1.ComponentType.Firmware,
    componentType_1.ComponentType.File,
    componentType_1.ComponentType.MachineLearningModel,
    componentType_1.ComponentType.Data
], [
    hashAlogorithm_1.HashAlgorithm.MD5,
    hashAlogorithm_1.HashAlgorithm['SHA-1'],
    hashAlogorithm_1.HashAlgorithm['SHA-256'],
    hashAlogorithm_1.HashAlgorithm['SHA-384'],
    hashAlogorithm_1.HashAlgorithm['SHA-512'],
    hashAlogorithm_1.HashAlgorithm['SHA3-256'],
    hashAlogorithm_1.HashAlgorithm['SHA3-384'],
    hashAlogorithm_1.HashAlgorithm['SHA3-512'],
    hashAlogorithm_1.HashAlgorithm['BLAKE2b-256'],
    hashAlogorithm_1.HashAlgorithm['BLAKE2b-384'],
    hashAlogorithm_1.HashAlgorithm['BLAKE2b-512'],
    hashAlogorithm_1.HashAlgorithm.BLAKE3
], /^([a-fA-F0-9]{32})$|^([a-fA-F0-9]{40})$|^([a-fA-F0-9]{64})$|^([a-fA-F0-9]{96})$|^([a-fA-F0-9]{128})$/, [
    externalReferenceType_1.ExternalReferenceType.VCS,
    externalReferenceType_1.ExternalReferenceType.IssueTracker,
    externalReferenceType_1.ExternalReferenceType.Website,
    externalReferenceType_1.ExternalReferenceType.Advisories,
    externalReferenceType_1.ExternalReferenceType.BOM,
    externalReferenceType_1.ExternalReferenceType.MailingList,
    externalReferenceType_1.ExternalReferenceType.Social,
    externalReferenceType_1.ExternalReferenceType.Chat,
    externalReferenceType_1.ExternalReferenceType.Documentation,
    externalReferenceType_1.ExternalReferenceType.Support,
    externalReferenceType_1.ExternalReferenceType.Distribution,
    externalReferenceType_1.ExternalReferenceType.DistributionIntake,
    externalReferenceType_1.ExternalReferenceType.License,
    externalReferenceType_1.ExternalReferenceType.BuildMeta,
    externalReferenceType_1.ExternalReferenceType.BuildSystem,
    externalReferenceType_1.ExternalReferenceType.ReleaseNotes,
    externalReferenceType_1.ExternalReferenceType.SecurityContact,
    externalReferenceType_1.ExternalReferenceType.ModelCard,
    externalReferenceType_1.ExternalReferenceType.Log,
    externalReferenceType_1.ExternalReferenceType.Configuration,
    externalReferenceType_1.ExternalReferenceType.Evidence,
    externalReferenceType_1.ExternalReferenceType.Formulation,
    externalReferenceType_1.ExternalReferenceType.Attestation,
    externalReferenceType_1.ExternalReferenceType.ThreatModel,
    externalReferenceType_1.ExternalReferenceType.AdversaryModel,
    externalReferenceType_1.ExternalReferenceType.RiskAssessment,
    externalReferenceType_1.ExternalReferenceType.VulnerabilityAssertion,
    externalReferenceType_1.ExternalReferenceType.ExploitabilityStatement,
    externalReferenceType_1.ExternalReferenceType.PentestReport,
    externalReferenceType_1.ExternalReferenceType.StaticAnalysisReport,
    externalReferenceType_1.ExternalReferenceType.DynamicAnalysisReport,
    externalReferenceType_1.ExternalReferenceType.RuntimeAnalysisReport,
    externalReferenceType_1.ExternalReferenceType.ComponentAnalysisReport,
    externalReferenceType_1.ExternalReferenceType.MaturityReport,
    externalReferenceType_1.ExternalReferenceType.CertificationReport,
    externalReferenceType_1.ExternalReferenceType.CodifiedInfrastructure,
    externalReferenceType_1.ExternalReferenceType.QualityMetrics,
    externalReferenceType_1.ExternalReferenceType.POAM,
    externalReferenceType_1.ExternalReferenceType.Other
], true, true, false, true, true, [
    ratingMethod_1.RatingMethod.CVSSv2,
    ratingMethod_1.RatingMethod.CVSSv3,
    ratingMethod_1.RatingMethod.CVSSv31,
    ratingMethod_1.RatingMethod.CVSSv4,
    ratingMethod_1.RatingMethod.OWASP,
    ratingMethod_1.RatingMethod.SSVC,
    ratingMethod_1.RatingMethod.Other
], true, true, true, true, true, false, true, true, true));
exports.Spec1dot6 = Object.freeze(new _protocol_1._Spec(enums_1.Version.v1dot6, [
    enums_1.Format.XML,
    enums_1.Format.JSON
], [
    componentType_1.ComponentType.Application,
    componentType_1.ComponentType.Framework,
    componentType_1.ComponentType.Library,
    componentType_1.ComponentType.Container,
    componentType_1.ComponentType.Platform,
    componentType_1.ComponentType.OperatingSystem,
    componentType_1.ComponentType.Device,
    componentType_1.ComponentType.DeviceDriver,
    componentType_1.ComponentType.Firmware,
    componentType_1.ComponentType.File,
    componentType_1.ComponentType.MachineLearningModel,
    componentType_1.ComponentType.Data,
    componentType_1.ComponentType.CryptographicAsset
], [
    hashAlogorithm_1.HashAlgorithm.MD5,
    hashAlogorithm_1.HashAlgorithm['SHA-1'],
    hashAlogorithm_1.HashAlgorithm['SHA-256'],
    hashAlogorithm_1.HashAlgorithm['SHA-384'],
    hashAlogorithm_1.HashAlgorithm['SHA-512'],
    hashAlogorithm_1.HashAlgorithm['SHA3-256'],
    hashAlogorithm_1.HashAlgorithm['SHA3-384'],
    hashAlogorithm_1.HashAlgorithm['SHA3-512'],
    hashAlogorithm_1.HashAlgorithm['BLAKE2b-256'],
    hashAlogorithm_1.HashAlgorithm['BLAKE2b-384'],
    hashAlogorithm_1.HashAlgorithm['BLAKE2b-512'],
    hashAlogorithm_1.HashAlgorithm.BLAKE3
], /^([a-fA-F0-9]{32})$|^([a-fA-F0-9]{40})$|^([a-fA-F0-9]{64})$|^([a-fA-F0-9]{96})$|^([a-fA-F0-9]{128})$/, [
    externalReferenceType_1.ExternalReferenceType.VCS,
    externalReferenceType_1.ExternalReferenceType.IssueTracker,
    externalReferenceType_1.ExternalReferenceType.Website,
    externalReferenceType_1.ExternalReferenceType.Advisories,
    externalReferenceType_1.ExternalReferenceType.BOM,
    externalReferenceType_1.ExternalReferenceType.MailingList,
    externalReferenceType_1.ExternalReferenceType.Social,
    externalReferenceType_1.ExternalReferenceType.Chat,
    externalReferenceType_1.ExternalReferenceType.Documentation,
    externalReferenceType_1.ExternalReferenceType.Support,
    externalReferenceType_1.ExternalReferenceType.SourceDistribution,
    externalReferenceType_1.ExternalReferenceType.Distribution,
    externalReferenceType_1.ExternalReferenceType.DistributionIntake,
    externalReferenceType_1.ExternalReferenceType.License,
    externalReferenceType_1.ExternalReferenceType.BuildMeta,
    externalReferenceType_1.ExternalReferenceType.BuildSystem,
    externalReferenceType_1.ExternalReferenceType.ReleaseNotes,
    externalReferenceType_1.ExternalReferenceType.SecurityContact,
    externalReferenceType_1.ExternalReferenceType.ModelCard,
    externalReferenceType_1.ExternalReferenceType.Log,
    externalReferenceType_1.ExternalReferenceType.Configuration,
    externalReferenceType_1.ExternalReferenceType.Evidence,
    externalReferenceType_1.ExternalReferenceType.Formulation,
    externalReferenceType_1.ExternalReferenceType.Attestation,
    externalReferenceType_1.ExternalReferenceType.ThreatModel,
    externalReferenceType_1.ExternalReferenceType.AdversaryModel,
    externalReferenceType_1.ExternalReferenceType.RiskAssessment,
    externalReferenceType_1.ExternalReferenceType.VulnerabilityAssertion,
    externalReferenceType_1.ExternalReferenceType.ExploitabilityStatement,
    externalReferenceType_1.ExternalReferenceType.PentestReport,
    externalReferenceType_1.ExternalReferenceType.StaticAnalysisReport,
    externalReferenceType_1.ExternalReferenceType.DynamicAnalysisReport,
    externalReferenceType_1.ExternalReferenceType.RuntimeAnalysisReport,
    externalReferenceType_1.ExternalReferenceType.ComponentAnalysisReport,
    externalReferenceType_1.ExternalReferenceType.MaturityReport,
    externalReferenceType_1.ExternalReferenceType.CertificationReport,
    externalReferenceType_1.ExternalReferenceType.CodifiedInfrastructure,
    externalReferenceType_1.ExternalReferenceType.QualityMetrics,
    externalReferenceType_1.ExternalReferenceType.POAM,
    externalReferenceType_1.ExternalReferenceType.ElectronicSignature,
    externalReferenceType_1.ExternalReferenceType.DigitalSignature,
    externalReferenceType_1.ExternalReferenceType.RFC9116,
    externalReferenceType_1.ExternalReferenceType.Other
], true, true, false, true, true, [
    ratingMethod_1.RatingMethod.CVSSv2,
    ratingMethod_1.RatingMethod.CVSSv3,
    ratingMethod_1.RatingMethod.CVSSv31,
    ratingMethod_1.RatingMethod.CVSSv4,
    ratingMethod_1.RatingMethod.OWASP,
    ratingMethod_1.RatingMethod.SSVC,
    ratingMethod_1.RatingMethod.Other
], true, true, true, true, true, true, true, true, true));
exports.Spec1dot7 = Object.freeze(new _protocol_1._Spec(enums_1.Version.v1dot7, [
    enums_1.Format.XML,
    enums_1.Format.JSON
], [
    componentType_1.ComponentType.Application,
    componentType_1.ComponentType.Framework,
    componentType_1.ComponentType.Library,
    componentType_1.ComponentType.Container,
    componentType_1.ComponentType.Platform,
    componentType_1.ComponentType.OperatingSystem,
    componentType_1.ComponentType.Device,
    componentType_1.ComponentType.DeviceDriver,
    componentType_1.ComponentType.Firmware,
    componentType_1.ComponentType.File,
    componentType_1.ComponentType.MachineLearningModel,
    componentType_1.ComponentType.Data,
    componentType_1.ComponentType.CryptographicAsset
], [
    hashAlogorithm_1.HashAlgorithm.MD5,
    hashAlogorithm_1.HashAlgorithm['SHA-1'],
    hashAlogorithm_1.HashAlgorithm['SHA-256'],
    hashAlogorithm_1.HashAlgorithm['SHA-384'],
    hashAlogorithm_1.HashAlgorithm['SHA-512'],
    hashAlogorithm_1.HashAlgorithm['SHA3-256'],
    hashAlogorithm_1.HashAlgorithm['SHA3-384'],
    hashAlogorithm_1.HashAlgorithm['SHA3-512'],
    hashAlogorithm_1.HashAlgorithm['BLAKE2b-256'],
    hashAlogorithm_1.HashAlgorithm['BLAKE2b-384'],
    hashAlogorithm_1.HashAlgorithm['BLAKE2b-512'],
    hashAlogorithm_1.HashAlgorithm.BLAKE3,
    hashAlogorithm_1.HashAlgorithm['Streebog-256'],
    hashAlogorithm_1.HashAlgorithm['Streebog-512'],
], /^([a-fA-F0-9]{32})$|^([a-fA-F0-9]{40})$|^([a-fA-F0-9]{64})$|^([a-fA-F0-9]{96})$|^([a-fA-F0-9]{128})$/, [
    externalReferenceType_1.ExternalReferenceType.VCS,
    externalReferenceType_1.ExternalReferenceType.IssueTracker,
    externalReferenceType_1.ExternalReferenceType.Website,
    externalReferenceType_1.ExternalReferenceType.Advisories,
    externalReferenceType_1.ExternalReferenceType.BOM,
    externalReferenceType_1.ExternalReferenceType.MailingList,
    externalReferenceType_1.ExternalReferenceType.Social,
    externalReferenceType_1.ExternalReferenceType.Chat,
    externalReferenceType_1.ExternalReferenceType.Documentation,
    externalReferenceType_1.ExternalReferenceType.Support,
    externalReferenceType_1.ExternalReferenceType.SourceDistribution,
    externalReferenceType_1.ExternalReferenceType.Distribution,
    externalReferenceType_1.ExternalReferenceType.DistributionIntake,
    externalReferenceType_1.ExternalReferenceType.License,
    externalReferenceType_1.ExternalReferenceType.BuildMeta,
    externalReferenceType_1.ExternalReferenceType.BuildSystem,
    externalReferenceType_1.ExternalReferenceType.ReleaseNotes,
    externalReferenceType_1.ExternalReferenceType.SecurityContact,
    externalReferenceType_1.ExternalReferenceType.ModelCard,
    externalReferenceType_1.ExternalReferenceType.Log,
    externalReferenceType_1.ExternalReferenceType.Configuration,
    externalReferenceType_1.ExternalReferenceType.Evidence,
    externalReferenceType_1.ExternalReferenceType.Formulation,
    externalReferenceType_1.ExternalReferenceType.Attestation,
    externalReferenceType_1.ExternalReferenceType.ThreatModel,
    externalReferenceType_1.ExternalReferenceType.AdversaryModel,
    externalReferenceType_1.ExternalReferenceType.RiskAssessment,
    externalReferenceType_1.ExternalReferenceType.VulnerabilityAssertion,
    externalReferenceType_1.ExternalReferenceType.ExploitabilityStatement,
    externalReferenceType_1.ExternalReferenceType.PentestReport,
    externalReferenceType_1.ExternalReferenceType.StaticAnalysisReport,
    externalReferenceType_1.ExternalReferenceType.DynamicAnalysisReport,
    externalReferenceType_1.ExternalReferenceType.RuntimeAnalysisReport,
    externalReferenceType_1.ExternalReferenceType.ComponentAnalysisReport,
    externalReferenceType_1.ExternalReferenceType.MaturityReport,
    externalReferenceType_1.ExternalReferenceType.CertificationReport,
    externalReferenceType_1.ExternalReferenceType.CodifiedInfrastructure,
    externalReferenceType_1.ExternalReferenceType.QualityMetrics,
    externalReferenceType_1.ExternalReferenceType.POAM,
    externalReferenceType_1.ExternalReferenceType.ElectronicSignature,
    externalReferenceType_1.ExternalReferenceType.DigitalSignature,
    externalReferenceType_1.ExternalReferenceType.RFC9116,
    externalReferenceType_1.ExternalReferenceType.Citation,
    externalReferenceType_1.ExternalReferenceType.Patent,
    externalReferenceType_1.ExternalReferenceType.PatentAssertion,
    externalReferenceType_1.ExternalReferenceType.PatentFamily,
    externalReferenceType_1.ExternalReferenceType.RFC9116,
    externalReferenceType_1.ExternalReferenceType.Other
], true, true, false, true, true, [
    ratingMethod_1.RatingMethod.CVSSv2,
    ratingMethod_1.RatingMethod.CVSSv3,
    ratingMethod_1.RatingMethod.CVSSv31,
    ratingMethod_1.RatingMethod.CVSSv4,
    ratingMethod_1.RatingMethod.OWASP,
    ratingMethod_1.RatingMethod.SSVC,
    ratingMethod_1.RatingMethod.Other
], true, true, true, true, true, true, true, true, true));
exports.SpecVersionDict = Object.freeze({
    [enums_1.Version.v1dot7]: exports.Spec1dot7,
    [enums_1.Version.v1dot6]: exports.Spec1dot6,
    [enums_1.Version.v1dot5]: exports.Spec1dot5,
    [enums_1.Version.v1dot4]: exports.Spec1dot4,
    [enums_1.Version.v1dot3]: exports.Spec1dot3,
    [enums_1.Version.v1dot2]: exports.Spec1dot2
});
//# sourceMappingURL=consts.js.map

},
45928(__unused_rspack_module, exports) {

/*!
This file is part of CycloneDX JavaScript Library.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

   http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.

SPDX-License-Identifier: Apache-2.0
Copyright (c) OWASP Foundation. All Rights Reserved.
*/
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.Format = exports.Version = void 0;
var Version;
(function (Version) {
    Version["v1dot7"] = "1.7";
    Version["v1dot6"] = "1.6";
    Version["v1dot5"] = "1.5";
    Version["v1dot4"] = "1.4";
    Version["v1dot3"] = "1.3";
    Version["v1dot2"] = "1.2";
    Version["v1dot1"] = "1.1";
    Version["v1dot0"] = "1.0";
})(Version || (exports.Version = Version = {}));
var Format;
(function (Format) {
    Format["XML"] = "xml";
    Format["JSON"] = "json";
})(Format || (exports.Format = Format = {}));
//# sourceMappingURL=enums.js.map

},
22679(__unused_rspack_module, exports) {

/*!
This file is part of CycloneDX JavaScript Library.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

   http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.

SPDX-License-Identifier: Apache-2.0
Copyright (c) OWASP Foundation. All Rights Reserved.
*/
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.UnsupportedFormatError = void 0;
class UnsupportedFormatError extends Error {
}
exports.UnsupportedFormatError = UnsupportedFormatError;
//# sourceMappingURL=errors.js.map

},
32898(__unused_rspack_module, exports, __webpack_require__) {

/*!
This file is part of CycloneDX JavaScript Library.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

   http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.

SPDX-License-Identifier: Apache-2.0
Copyright (c) OWASP Foundation. All Rights Reserved.
*/
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
__exportStar(__webpack_require__(25596), exports);
__exportStar(__webpack_require__(45928), exports);
__exportStar(__webpack_require__(22679), exports);
//# sourceMappingURL=index.js.map

},
71984(__unused_rspack_module, exports) {

/*!
This file is part of CycloneDX JavaScript Library.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

   http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.

SPDX-License-Identifier: Apache-2.0
Copyright (c) OWASP Foundation. All Rights Reserved.
*/
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.isCPE = isCPE;
const cpePattern = /^([c][pP][eE]:\/[AHOaho]?(:[A-Za-z0-9\._\-~%]*){0,6})$|^(cpe:2\.3:[aho\*\-](:(((\?*|\*?)([a-zA-Z0-9\-\._]|(\\[\\\*\?!"#$$%&'\(\)\+,\/:;<=>@\[\]\^`\{\|}~]))+(\?*|\*?))|[\*\-])){5}(:(([a-zA-Z]{2,3}(-([a-zA-Z]{2}|[0-9]{3}))?)|[\*\-]))(:(((\?*|\*?)([a-zA-Z0-9\-\._]|(\\[\\\*\?!"#$$%&'\(\)\+,\/:;<=>@\[\]\^`\{\|}~]))+(\?*|\*?))|[\*\-])){4})$/;
function isCPE(value) {
    return typeof value === 'string' &&
        cpePattern.test(value);
}
//# sourceMappingURL=cpe.js.map

},
57091(__unused_rspack_module, exports, __webpack_require__) {

/*!
This file is part of CycloneDX JavaScript Library.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

   http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.

SPDX-License-Identifier: Apache-2.0
Copyright (c) OWASP Foundation. All Rights Reserved.
*/
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.CweRepository = void 0;
exports.isCWE = isCWE;
const sortable_1 = __webpack_require__(56503);
const integer_1 = __webpack_require__(88428);
function isCWE(value) {
    return (0, integer_1.isPositiveInteger)(value);
}
class CweRepository extends sortable_1.SortableNumbers {
}
exports.CweRepository = CweRepository;
//# sourceMappingURL=cwe.js.map

},
60390(__unused_rspack_module, exports, __webpack_require__) {

/*!
This file is part of CycloneDX JavaScript Library.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

   http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.

SPDX-License-Identifier: Apache-2.0
Copyright (c) OWASP Foundation. All Rights Reserved.
*/
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
__exportStar(__webpack_require__(71984), exports);
__exportStar(__webpack_require__(57091), exports);
__exportStar(__webpack_require__(88428), exports);
__exportStar(__webpack_require__(46572), exports);
//# sourceMappingURL=index.js.map

},
88428(__unused_rspack_module, exports) {

/*!
This file is part of CycloneDX JavaScript Library.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

   http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.

SPDX-License-Identifier: Apache-2.0
Copyright (c) OWASP Foundation. All Rights Reserved.
*/
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.isInteger = isInteger;
exports.isNonNegativeInteger = isNonNegativeInteger;
exports.isPositiveInteger = isPositiveInteger;
function isInteger(value) {
    return Number.isInteger(value);
}
function isNonNegativeInteger(value) {
    return isInteger(value) &&
        value >= 0;
}
function isPositiveInteger(value) {
    return isInteger(value) &&
        value > 0;
}
//# sourceMappingURL=integer.js.map

},
46572(__unused_rspack_module, exports) {

/*!
This file is part of CycloneDX JavaScript Library.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

   http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.

SPDX-License-Identifier: Apache-2.0
Copyright (c) OWASP Foundation. All Rights Reserved.
*/
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.isMimeType = isMimeType;
const mimeTypePattern = /^[-+a-z0-9.]+\/[-+a-z0-9.]+$/;
function isMimeType(value) {
    return typeof value === 'string' &&
        mimeTypePattern.test(value);
}
//# sourceMappingURL=mimeType.js.map

},
92548(__unused_rspack_module, exports) {
var __webpack_unused_export__;

/*!
This file is part of CycloneDX JavaScript Library.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

   http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.

SPDX-License-Identifier: Apache-2.0
Copyright (c) OWASP Foundation. All Rights Reserved.
*/
__webpack_unused_export__ = ({ value: true });
exports.BaseValidator = void 0;
class BaseValidator {
    #version;
    constructor(version) {
        this.#version = version;
    }
    get version() {
        return this.#version;
    }
}
exports.BaseValidator = BaseValidator;
//# sourceMappingURL=baseValidator.js.map

},
15235(__unused_rspack_module, exports, __webpack_require__) {

/*!
This file is part of CycloneDX JavaScript Library.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

   http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.

SPDX-License-Identifier: Apache-2.0
Copyright (c) OWASP Foundation. All Rights Reserved.
*/
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.MissingOptionalDependencyError = exports.NotImplementedError = void 0;
const errors_1 = __webpack_require__(56296);
class NotImplementedError extends Error {
    constructor(version) {
        super(`not implemented for CycloneDX version: ${version}`);
    }
}
exports.NotImplementedError = NotImplementedError;
class MissingOptionalDependencyError extends errors_1.OptPlugError {
}
exports.MissingOptionalDependencyError = MissingOptionalDependencyError;
//# sourceMappingURL=errors.js.map

},
60183(__unused_rspack_module, exports, __webpack_require__) {

/*!
This file is part of CycloneDX JavaScript Library.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

   http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.

SPDX-License-Identifier: Apache-2.0
Copyright (c) OWASP Foundation. All Rights Reserved.
*/
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.Types = void 0;
__exportStar(__webpack_require__(15235), exports);
exports.Types = __importStar(__webpack_require__(8960));
//# sourceMappingURL=index.common.js.map

},
42154(__unused_rspack_module, exports, __webpack_require__) {

/*!
This file is part of CycloneDX JavaScript Library.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

   http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.

SPDX-License-Identifier: Apache-2.0
Copyright (c) OWASP Foundation. All Rights Reserved.
*/
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
__exportStar(__webpack_require__(60183), exports);
__exportStar(__webpack_require__(83574), exports);
__exportStar(__webpack_require__(5271), exports);
//# sourceMappingURL=index.node.js.map

},
83574(__unused_rspack_module, exports, __webpack_require__) {

/*!
This file is part of CycloneDX JavaScript Library.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

   http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.

SPDX-License-Identifier: Apache-2.0
Copyright (c) OWASP Foundation. All Rights Reserved.
*/
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.JsonStrictValidator = exports.JsonValidator = void 0;
const errors_1 = __webpack_require__(56296);
const jsonValidator_1 = __importDefault(__webpack_require__(5875));
const resources_node_1 = __webpack_require__(9471);
const baseValidator_1 = __webpack_require__(92548);
const errors_2 = __webpack_require__(15235);
class BaseJsonValidator extends baseValidator_1.BaseValidator {
    #getSchemaFilePath() {
        const s = this._getSchemaFile();
        if (s === undefined) {
            throw new errors_2.NotImplementedError(this.version);
        }
        return s;
    }
    #validatorCache = undefined;
    async #getValidator() {
        if (this.#validatorCache === undefined) {
            try {
                this.#validatorCache = await (0, jsonValidator_1.default)(this.#getSchemaFilePath(), {
                    'http://cyclonedx.org/schema/spdx.SNAPSHOT.schema.json': resources_node_1.FILES.SPDX.JSON_SCHEMA,
                    'http://cyclonedx.org/schema/cryptography-defs.SNAPSHOT.schema.json': resources_node_1.FILES.CryptoDefs.JSON_SCHEMA,
                    'http://cyclonedx.org/schema/jsf-0.82.SNAPSHOT.schema.json': resources_node_1.FILES.JSF.JSON_SCHEMA
                });
            }
            catch (err) {
                if (err instanceof errors_1.OptPlugError) {
                    throw new errors_2.MissingOptionalDependencyError(err.message, err);
                }
                throw err;
            }
        }
        return this.#validatorCache;
    }
    async validate(data) {
        return (await this.#getValidator())(data);
    }
}
class JsonValidator extends BaseJsonValidator {
    _getSchemaFile() {
        return resources_node_1.FILES.CDX.JSON_SCHEMA[this.version];
    }
}
exports.JsonValidator = JsonValidator;
class JsonStrictValidator extends BaseJsonValidator {
    _getSchemaFile() {
        return resources_node_1.FILES.CDX.JSON_STRICT_SCHEMA[this.version];
    }
}
exports.JsonStrictValidator = JsonStrictValidator;
//# sourceMappingURL=jsonValidator.node.js.map

},
8960(__unused_rspack_module, exports) {

/*!
This file is part of CycloneDX JavaScript Library.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

   http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.

SPDX-License-Identifier: Apache-2.0
Copyright (c) OWASP Foundation. All Rights Reserved.
*/
Object.defineProperty(exports, "__esModule", ({ value: true }));
//# sourceMappingURL=types.js.map

},
5271(__unused_rspack_module, exports, __webpack_require__) {

/*!
This file is part of CycloneDX JavaScript Library.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

   http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.

SPDX-License-Identifier: Apache-2.0
Copyright (c) OWASP Foundation. All Rights Reserved.
*/
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.XmlValidator = void 0;
const errors_1 = __webpack_require__(56296);
const xmlValidator_1 = __importDefault(__webpack_require__(51762));
const resources_node_1 = __webpack_require__(9471);
const baseValidator_1 = __webpack_require__(92548);
const errors_2 = __webpack_require__(15235);
class XmlValidator extends baseValidator_1.BaseValidator {
    #getSchemaFilePath() {
        const s = resources_node_1.FILES.CDX.XML_SCHEMA[this.version];
        if (s === undefined) {
            throw new errors_2.NotImplementedError(this.version);
        }
        return s;
    }
    #validatorCache = undefined;
    async #getValidator() {
        if (this.#validatorCache === undefined) {
            try {
                this.#validatorCache = await (0, xmlValidator_1.default)(this.#getSchemaFilePath());
            }
            catch (err) {
                if (err instanceof errors_1.OptPlugError) {
                    throw new errors_2.MissingOptionalDependencyError(err.message, err);
                }
                throw err;
            }
        }
        return this.#validatorCache;
    }
    async validate(data) {
        return (await this.#getValidator())(data);
    }
}
exports.XmlValidator = XmlValidator;
//# sourceMappingURL=xmlValidator.node.js.map

},
87052(module, __unused_rspack_exports, __webpack_require__) {


const { normalizeIPv6, removeDotSegments, recomposeAuthority, normalizePercentEncoding, normalizePathEncoding, escapePreservingEscapes, reescapeHostDelimiters, isIPv4, nonSimpleDomain } = __webpack_require__(9249)
const { SCHEMES, getSchemeHandler } = __webpack_require__(48144)

/**
 * @template {import('./types/index').URIComponent|string} T
 * @param {T} uri
 * @param {import('./types/index').Options} [options]
 * @returns {T}
 */
function normalize (uri, options) {
  if (typeof uri === 'string') {
    uri = /** @type {T} */ (normalizeString(uri, options))
  } else if (typeof uri === 'object') {
    uri = /** @type {T} */ (parse(serialize(uri, options), options))
  }
  return uri
}

/**
 * @param {string} baseURI
 * @param {string} relativeURI
 * @param {import('./types/index').Options} [options]
 * @returns {string}
 */
function resolve (baseURI, relativeURI, options) {
  const schemelessOptions = options ? Object.assign({ scheme: 'null' }, options) : { scheme: 'null' }
  const resolved = resolveComponent(parse(baseURI, schemelessOptions), parse(relativeURI, schemelessOptions), schemelessOptions, true)
  schemelessOptions.skipEscape = true
  return serialize(resolved, schemelessOptions)
}

/**
 * @param {import ('./types/index').URIComponent} base
 * @param {import ('./types/index').URIComponent} relative
 * @param {import('./types/index').Options} [options]
 * @param {boolean} [skipNormalization=false]
 * @returns {import ('./types/index').URIComponent}
 */
function resolveComponent (base, relative, options, skipNormalization) {
  /** @type {import('./types/index').URIComponent} */
  const target = {}
  if (!skipNormalization) {
    base = parse(serialize(base, options), options) // normalize base component
    relative = parse(serialize(relative, options), options) // normalize relative component
  }
  options = options || {}

  if (!options.tolerant && relative.scheme) {
    target.scheme = relative.scheme
    // target.authority = relative.authority;
    target.userinfo = relative.userinfo
    target.host = relative.host
    target.port = relative.port
    target.path = removeDotSegments(relative.path || '')
    target.query = relative.query
  } else {
    if (relative.userinfo !== undefined || relative.host !== undefined || relative.port !== undefined) {
      // target.authority = relative.authority;
      target.userinfo = relative.userinfo
      target.host = relative.host
      target.port = relative.port
      target.path = removeDotSegments(relative.path || '')
      target.query = relative.query
    } else {
      if (!relative.path) {
        target.path = base.path
        if (relative.query !== undefined) {
          target.query = relative.query
        } else {
          target.query = base.query
        }
      } else {
        if (relative.path[0] === '/') {
          target.path = removeDotSegments(relative.path)
        } else {
          if ((base.userinfo !== undefined || base.host !== undefined || base.port !== undefined) && !base.path) {
            target.path = '/' + relative.path
          } else if (!base.path) {
            target.path = relative.path
          } else {
            target.path = base.path.slice(0, base.path.lastIndexOf('/') + 1) + relative.path
          }
          target.path = removeDotSegments(target.path)
        }
        target.query = relative.query
      }
      // target.authority = base.authority;
      target.userinfo = base.userinfo
      target.host = base.host
      target.port = base.port
    }
    target.scheme = base.scheme
  }

  target.fragment = relative.fragment

  return target
}

/**
 * @param {import ('./types/index').URIComponent|string} uriA
 * @param {import ('./types/index').URIComponent|string} uriB
 * @param {import ('./types/index').Options} options
 * @returns {boolean}
 */
function equal (uriA, uriB, options) {
  const normalizedA = normalizeComparableURI(uriA, options)
  const normalizedB = normalizeComparableURI(uriB, options)

  return normalizedA !== undefined && normalizedB !== undefined && normalizedA.toLowerCase() === normalizedB.toLowerCase()
}

/**
 * @param {Readonly<import('./types/index').URIComponent>} cmpts
 * @param {import('./types/index').Options} [opts]
 * @returns {string}
 */
function serialize (cmpts, opts) {
  const component = {
    host: cmpts.host,
    scheme: cmpts.scheme,
    userinfo: cmpts.userinfo,
    port: cmpts.port,
    path: cmpts.path,
    query: cmpts.query,
    nid: cmpts.nid,
    nss: cmpts.nss,
    uuid: cmpts.uuid,
    fragment: cmpts.fragment,
    reference: cmpts.reference,
    resourceName: cmpts.resourceName,
    secure: cmpts.secure,
    error: ''
  }
  const options = Object.assign({}, opts)
  const uriTokens = []

  // find scheme handler
  const schemeHandler = getSchemeHandler(options.scheme || component.scheme)

  // perform scheme specific serialization
  if (schemeHandler && schemeHandler.serialize) schemeHandler.serialize(component, options)

  if (component.path !== undefined) {
    if (!options.skipEscape) {
      component.path = escapePreservingEscapes(component.path)

      if (component.scheme !== undefined) {
        component.path = component.path.split('%3A').join(':')
      }
    } else {
      component.path = normalizePercentEncoding(component.path)
    }
  }

  if (options.reference !== 'suffix' && component.scheme) {
    uriTokens.push(component.scheme, ':')
  }

  const authority = recomposeAuthority(component)
  if (authority !== undefined) {
    if (options.reference !== 'suffix') {
      uriTokens.push('//')
    }

    uriTokens.push(authority)

    if (component.path && component.path[0] !== '/') {
      uriTokens.push('/')
    }
  }
  if (component.path !== undefined) {
    let s = component.path

    if (!options.absolutePath && (!schemeHandler || !schemeHandler.absolutePath)) {
      s = removeDotSegments(s)
    }

    if (
      authority === undefined &&
      s[0] === '/' &&
      s[1] === '/'
    ) {
      // don't allow the path to start with "//"
      s = '/%2F' + s.slice(2)
    }

    uriTokens.push(s)
  }

  if (component.query !== undefined) {
    uriTokens.push('?', component.query)
  }

  if (component.fragment !== undefined) {
    uriTokens.push('#', component.fragment)
  }
  return uriTokens.join('')
}

const URI_PARSE = /^(?:([^#/:?]+):)?(?:\/\/((?:([^#/?@]*)@)?(\[[^#/?\]]+\]|[^#/:?]*)(?::(\d*))?))?([^#?]*)(?:\?([^#]*))?(?:#((?:.|[\n\r])*))?/u

/**
 * @param {import('./types/index').URIComponent} parsed
 * @param {RegExpMatchArray} matches
 * @returns {string|undefined}
 */
function getParseError (parsed, matches) {
  if (matches[2] !== undefined && parsed.path && parsed.path[0] !== '/') {
    return 'URI path must start with "/" when authority is present.'
  }

  if (typeof parsed.port === 'number' && (parsed.port < 0 || parsed.port > 65535)) {
    return 'URI port is malformed.'
  }

  return undefined
}

/**
 * @param {string} uri
 * @param {import('./types/index').Options} [opts]
 * @returns {{ parsed: import('./types/index').URIComponent, malformedAuthorityOrPort: boolean }}
 */
function parseWithStatus (uri, opts) {
  const options = Object.assign({}, opts)
  /** @type {import('./types/index').URIComponent} */
  const parsed = {
    scheme: undefined,
    userinfo: undefined,
    host: '',
    port: undefined,
    path: '',
    query: undefined,
    fragment: undefined
  }

  let malformedAuthorityOrPort = false

  let isIP = false
  if (options.reference === 'suffix') {
    if (options.scheme) {
      uri = options.scheme + ':' + uri
    } else {
      uri = '//' + uri
    }
  }

  const matches = uri.match(URI_PARSE)

  if (matches) {
    // store each component
    parsed.scheme = matches[1]
    parsed.userinfo = matches[3]
    parsed.host = matches[4]
    parsed.port = parseInt(matches[5], 10)
    parsed.path = matches[6] || ''
    parsed.query = matches[7]
    parsed.fragment = matches[8]

    // fix port number
    if (isNaN(parsed.port)) {
      parsed.port = matches[5]
    }

    const parseError = getParseError(parsed, matches)
    if (parseError !== undefined) {
      parsed.error = parsed.error || parseError
      malformedAuthorityOrPort = true
    }

    if (parsed.host) {
      const ipv4result = isIPv4(parsed.host)
      if (ipv4result === false) {
        const ipv6result = normalizeIPv6(parsed.host)
        parsed.host = ipv6result.host.toLowerCase()
        isIP = ipv6result.isIPV6
      } else {
        isIP = true
      }
    }
    if (parsed.scheme === undefined && parsed.userinfo === undefined && parsed.host === undefined && parsed.port === undefined && parsed.query === undefined && !parsed.path) {
      parsed.reference = 'same-document'
    } else if (parsed.scheme === undefined) {
      parsed.reference = 'relative'
    } else if (parsed.fragment === undefined) {
      parsed.reference = 'absolute'
    } else {
      parsed.reference = 'uri'
    }

    // check for reference errors
    if (options.reference && options.reference !== 'suffix' && options.reference !== parsed.reference) {
      parsed.error = parsed.error || 'URI is not a ' + options.reference + ' reference.'
    }

    // find scheme handler
    const schemeHandler = getSchemeHandler(options.scheme || parsed.scheme)

    // check if scheme can't handle IRIs
    if (!options.unicodeSupport && (!schemeHandler || !schemeHandler.unicodeSupport)) {
      // if host component is a domain name
      if (parsed.host && (options.domainHost || (schemeHandler && schemeHandler.domainHost)) && isIP === false && nonSimpleDomain(parsed.host)) {
        // convert Unicode IDN -> ASCII IDN
        try {
          parsed.host = URL.domainToASCII(parsed.host.toLowerCase())
        } catch (e) {
          parsed.error = parsed.error || "Host's domain name can not be converted to ASCII: " + e
        }
      }
      // convert IRI -> URI
    }

    if (!schemeHandler || (schemeHandler && !schemeHandler.skipNormalize)) {
      if (uri.indexOf('%') !== -1) {
        if (parsed.scheme !== undefined) {
          parsed.scheme = unescape(parsed.scheme)
        }
        if (parsed.host !== undefined) {
          parsed.host = reescapeHostDelimiters(unescape(parsed.host), isIP)
        }
      }
      if (parsed.path) {
        parsed.path = normalizePathEncoding(parsed.path)
      }
      if (parsed.fragment) {
        try {
          parsed.fragment = encodeURI(decodeURIComponent(parsed.fragment))
        } catch {
          parsed.error = parsed.error || 'URI malformed'
        }
      }
    }

    // perform scheme specific parsing
    if (schemeHandler && schemeHandler.parse) {
      schemeHandler.parse(parsed, options)
    }
  } else {
    parsed.error = parsed.error || 'URI can not be parsed.'
  }
  return { parsed, malformedAuthorityOrPort }
}

/**
 * @param {string} uri
 * @param {import('./types/index').Options} [opts]
 * @returns
 */
function parse (uri, opts) {
  return parseWithStatus(uri, opts).parsed
}

/**
 * @param {string} uri
 * @param {import('./types/index').Options} [opts]
 * @returns {string}
 */
function normalizeString (uri, opts) {
  return normalizeStringWithStatus(uri, opts).normalized
}

/**
 * @param {string} uri
 * @param {import('./types/index').Options} [opts]
 * @returns {{ normalized: string, malformedAuthorityOrPort: boolean }}
 */
function normalizeStringWithStatus (uri, opts) {
  const { parsed, malformedAuthorityOrPort } = parseWithStatus(uri, opts)
  return {
    normalized: malformedAuthorityOrPort ? uri : serialize(parsed, opts),
    malformedAuthorityOrPort
  }
}

/**
 * @param {import ('./types/index').URIComponent|string} uri
 * @param {import('./types/index').Options} [opts]
 * @returns {string|undefined}
 */
function normalizeComparableURI (uri, opts) {
  if (typeof uri === 'string') {
    const { normalized, malformedAuthorityOrPort } = normalizeStringWithStatus(uri, opts)
    return malformedAuthorityOrPort ? undefined : normalized
  }

  if (typeof uri === 'object') {
    return serialize(uri, opts)
  }
}

const fastUri = {
  SCHEMES,
  normalize,
  resolve,
  resolveComponent,
  equal,
  serialize,
  parse
}

module.exports = fastUri
module.exports["default"] = fastUri
module.exports.fastUri = fastUri


},
48144(module, __unused_rspack_exports, __webpack_require__) {


const { isUUID } = __webpack_require__(9249)
const URN_REG = /([\da-z][\d\-a-z]{0,31}):((?:[\w!$'()*+,\-.:;=@]|%[\da-f]{2})+)/iu

const supportedSchemeNames = /** @type {const} */ (['http', 'https', 'ws',
  'wss', 'urn', 'urn:uuid'])

/** @typedef {supportedSchemeNames[number]} SchemeName */

/**
 * @param {string} name
 * @returns {name is SchemeName}
 */
function isValidSchemeName (name) {
  return supportedSchemeNames.indexOf(/** @type {*} */ (name)) !== -1
}

/**
 * @callback SchemeFn
 * @param {import('../types/index').URIComponent} component
 * @param {import('../types/index').Options} options
 * @returns {import('../types/index').URIComponent}
 */

/**
 * @typedef {Object} SchemeHandler
 * @property {SchemeName} scheme - The scheme name.
 * @property {boolean} [domainHost] - Indicates if the scheme supports domain hosts.
 * @property {SchemeFn} parse - Function to parse the URI component for this scheme.
 * @property {SchemeFn} serialize - Function to serialize the URI component for this scheme.
 * @property {boolean} [skipNormalize] - Indicates if normalization should be skipped for this scheme.
 * @property {boolean} [absolutePath] - Indicates if the scheme uses absolute paths.
 * @property {boolean} [unicodeSupport] - Indicates if the scheme supports Unicode.
 */

/**
 * @param {import('../types/index').URIComponent} wsComponent
 * @returns {boolean}
 */
function wsIsSecure (wsComponent) {
  if (wsComponent.secure === true) {
    return true
  } else if (wsComponent.secure === false) {
    return false
  } else if (wsComponent.scheme) {
    return (
      wsComponent.scheme.length === 3 &&
      (wsComponent.scheme[0] === 'w' || wsComponent.scheme[0] === 'W') &&
      (wsComponent.scheme[1] === 's' || wsComponent.scheme[1] === 'S') &&
      (wsComponent.scheme[2] === 's' || wsComponent.scheme[2] === 'S')
    )
  } else {
    return false
  }
}

/** @type {SchemeFn} */
function httpParse (component) {
  if (!component.host) {
    component.error = component.error || 'HTTP URIs must have a host.'
  }

  return component
}

/** @type {SchemeFn} */
function httpSerialize (component) {
  const secure = String(component.scheme).toLowerCase() === 'https'

  // normalize the default port
  if (component.port === (secure ? 443 : 80) || component.port === '') {
    component.port = undefined
  }

  // normalize the empty path
  if (!component.path) {
    component.path = '/'
  }

  // NOTE: We do not parse query strings for HTTP URIs
  // as WWW Form Url Encoded query strings are part of the HTML4+ spec,
  // and not the HTTP spec.

  return component
}

/** @type {SchemeFn} */
function wsParse (wsComponent) {
// indicate if the secure flag is set
  wsComponent.secure = wsIsSecure(wsComponent)

  // construct resouce name
  wsComponent.resourceName = (wsComponent.path || '/') + (wsComponent.query ? '?' + wsComponent.query : '')
  wsComponent.path = undefined
  wsComponent.query = undefined

  return wsComponent
}

/** @type {SchemeFn} */
function wsSerialize (wsComponent) {
// normalize the default port
  if (wsComponent.port === (wsIsSecure(wsComponent) ? 443 : 80) || wsComponent.port === '') {
    wsComponent.port = undefined
  }

  // ensure scheme matches secure flag
  if (typeof wsComponent.secure === 'boolean') {
    wsComponent.scheme = (wsComponent.secure ? 'wss' : 'ws')
    wsComponent.secure = undefined
  }

  // reconstruct path from resource name
  if (wsComponent.resourceName) {
    const [path, query] = wsComponent.resourceName.split('?')
    wsComponent.path = (path && path !== '/' ? path : undefined)
    wsComponent.query = query
    wsComponent.resourceName = undefined
  }

  // forbid fragment component
  wsComponent.fragment = undefined

  return wsComponent
}

/** @type {SchemeFn} */
function urnParse (urnComponent, options) {
  if (!urnComponent.path) {
    urnComponent.error = 'URN can not be parsed'
    return urnComponent
  }
  const matches = urnComponent.path.match(URN_REG)
  if (matches) {
    const scheme = options.scheme || urnComponent.scheme || 'urn'
    urnComponent.nid = matches[1].toLowerCase()
    urnComponent.nss = matches[2]
    const urnScheme = `${scheme}:${options.nid || urnComponent.nid}`
    const schemeHandler = getSchemeHandler(urnScheme)
    urnComponent.path = undefined

    if (schemeHandler) {
      urnComponent = schemeHandler.parse(urnComponent, options)
    }
  } else {
    urnComponent.error = urnComponent.error || 'URN can not be parsed.'
  }

  return urnComponent
}

/** @type {SchemeFn} */
function urnSerialize (urnComponent, options) {
  if (urnComponent.nid === undefined) {
    throw new Error('URN without nid cannot be serialized')
  }
  const scheme = options.scheme || urnComponent.scheme || 'urn'
  const nid = urnComponent.nid.toLowerCase()
  const urnScheme = `${scheme}:${options.nid || nid}`
  const schemeHandler = getSchemeHandler(urnScheme)

  if (schemeHandler) {
    urnComponent = schemeHandler.serialize(urnComponent, options)
  }

  const uriComponent = urnComponent
  const nss = urnComponent.nss
  uriComponent.path = `${nid || options.nid}:${nss}`

  options.skipEscape = true
  return uriComponent
}

/** @type {SchemeFn} */
function urnuuidParse (urnComponent, options) {
  const uuidComponent = urnComponent
  uuidComponent.uuid = uuidComponent.nss
  uuidComponent.nss = undefined

  if (!options.tolerant && (!uuidComponent.uuid || !isUUID(uuidComponent.uuid))) {
    uuidComponent.error = uuidComponent.error || 'UUID is not valid.'
  }

  return uuidComponent
}

/** @type {SchemeFn} */
function urnuuidSerialize (uuidComponent) {
  const urnComponent = uuidComponent
  // normalize UUID
  urnComponent.nss = (uuidComponent.uuid || '').toLowerCase()
  return urnComponent
}

const http = /** @type {SchemeHandler} */ ({
  scheme: 'http',
  domainHost: true,
  parse: httpParse,
  serialize: httpSerialize
})

const https = /** @type {SchemeHandler} */ ({
  scheme: 'https',
  domainHost: http.domainHost,
  parse: httpParse,
  serialize: httpSerialize
})

const ws = /** @type {SchemeHandler} */ ({
  scheme: 'ws',
  domainHost: true,
  parse: wsParse,
  serialize: wsSerialize
})

const wss = /** @type {SchemeHandler} */ ({
  scheme: 'wss',
  domainHost: ws.domainHost,
  parse: ws.parse,
  serialize: ws.serialize
})

const urn = /** @type {SchemeHandler} */ ({
  scheme: 'urn',
  parse: urnParse,
  serialize: urnSerialize,
  skipNormalize: true
})

const urnuuid = /** @type {SchemeHandler} */ ({
  scheme: 'urn:uuid',
  parse: urnuuidParse,
  serialize: urnuuidSerialize,
  skipNormalize: true
})

const SCHEMES = /** @type {Record<SchemeName, SchemeHandler>} */ ({
  http,
  https,
  ws,
  wss,
  urn,
  'urn:uuid': urnuuid
})

Object.setPrototypeOf(SCHEMES, null)

/**
 * @param {string|undefined} scheme
 * @returns {SchemeHandler|undefined}
 */
function getSchemeHandler (scheme) {
  return (
    scheme && (
      SCHEMES[/** @type {SchemeName} */ (scheme)] ||
      SCHEMES[/** @type {SchemeName} */(scheme.toLowerCase())])
  ) ||
    undefined
}

module.exports = {
  wsIsSecure,
  SCHEMES,
  isValidSchemeName,
  getSchemeHandler,
}


},
9249(module) {


/** @type {(value: string) => boolean} */
const isUUID = RegExp.prototype.test.bind(/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/iu)

/** @type {(value: string) => boolean} */
const isIPv4 = RegExp.prototype.test.bind(/^(?:(?:25[0-5]|2[0-4]\d|1\d{2}|[1-9]\d|\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d{2}|[1-9]\d|\d)$/u)

/** @type {(value: string) => boolean} */
const isHexPair = RegExp.prototype.test.bind(/^[\da-f]{2}$/iu)

/** @type {(value: string) => boolean} */
const isUnreserved = RegExp.prototype.test.bind(/^[\da-z\-._~]$/iu)

/** @type {(value: string) => boolean} */
const isPathCharacter = RegExp.prototype.test.bind(/^[\da-z\-._~!$&'()*+,;=:@/]$/iu)

/**
 * @param {Array<string>} input
 * @returns {string}
 */
function stringArrayToHexStripped (input) {
  let acc = ''
  let code = 0
  let i = 0

  for (i = 0; i < input.length; i++) {
    code = input[i].charCodeAt(0)
    if (code === 48) {
      continue
    }
    if (!((code >= 48 && code <= 57) || (code >= 65 && code <= 70) || (code >= 97 && code <= 102))) {
      return ''
    }
    acc += input[i]
    break
  }

  for (i += 1; i < input.length; i++) {
    code = input[i].charCodeAt(0)
    if (!((code >= 48 && code <= 57) || (code >= 65 && code <= 70) || (code >= 97 && code <= 102))) {
      return ''
    }
    acc += input[i]
  }
  return acc
}

/**
 * @typedef {Object} GetIPV6Result
 * @property {boolean} error - Indicates if there was an error parsing the IPv6 address.
 * @property {string} address - The parsed IPv6 address.
 * @property {string} [zone] - The zone identifier, if present.
 */

/**
 * @param {string} value
 * @returns {boolean}
 */
const nonSimpleDomain = RegExp.prototype.test.bind(/[^!"$&'()*+,\-.;=_`a-z{}~]/u)

/**
 * @param {Array<string>} buffer
 * @returns {boolean}
 */
function consumeIsZone (buffer) {
  buffer.length = 0
  return true
}

/**
 * @param {Array<string>} buffer
 * @param {Array<string>} address
 * @param {GetIPV6Result} output
 * @returns {boolean}
 */
function consumeHextets (buffer, address, output) {
  if (buffer.length) {
    const hex = stringArrayToHexStripped(buffer)
    if (hex !== '') {
      address.push(hex)
    } else {
      output.error = true
      return false
    }
    buffer.length = 0
  }
  return true
}

/**
 * @param {string} input
 * @returns {GetIPV6Result}
 */
function getIPV6 (input) {
  let tokenCount = 0
  const output = { error: false, address: '', zone: '' }
  /** @type {Array<string>} */
  const address = []
  /** @type {Array<string>} */
  const buffer = []
  let endipv6Encountered = false
  let endIpv6 = false

  let consume = consumeHextets

  for (let i = 0; i < input.length; i++) {
    const cursor = input[i]
    if (cursor === '[' || cursor === ']') { continue }
    if (cursor === ':') {
      if (endipv6Encountered === true) {
        endIpv6 = true
      }
      if (!consume(buffer, address, output)) { break }
      if (++tokenCount > 7) {
        // not valid
        output.error = true
        break
      }
      if (i > 0 && input[i - 1] === ':') {
        endipv6Encountered = true
      }
      address.push(':')
      continue
    } else if (cursor === '%') {
      if (!consume(buffer, address, output)) { break }
      // switch to zone detection
      consume = consumeIsZone
    } else {
      buffer.push(cursor)
      continue
    }
  }
  if (buffer.length) {
    if (consume === consumeIsZone) {
      output.zone = buffer.join('')
    } else if (endIpv6) {
      address.push(buffer.join(''))
    } else {
      address.push(stringArrayToHexStripped(buffer))
    }
  }
  output.address = address.join('')
  return output
}

/**
 * @typedef {Object} NormalizeIPv6Result
 * @property {string} host - The normalized host.
 * @property {string} [escapedHost] - The escaped host.
 * @property {boolean} isIPV6 - Indicates if the host is an IPv6 address.
 */

/**
 * @param {string} host
 * @returns {NormalizeIPv6Result}
 */
function normalizeIPv6 (host) {
  if (findToken(host, ':') < 2) { return { host, isIPV6: false } }
  const ipv6 = getIPV6(host)

  if (!ipv6.error) {
    let newHost = ipv6.address
    let escapedHost = ipv6.address
    if (ipv6.zone) {
      newHost += '%' + ipv6.zone
      escapedHost += '%25' + ipv6.zone
    }
    return { host: newHost, isIPV6: true, escapedHost }
  } else {
    return { host, isIPV6: false }
  }
}

/**
 * @param {string} str
 * @param {string} token
 * @returns {number}
 */
function findToken (str, token) {
  let ind = 0
  for (let i = 0; i < str.length; i++) {
    if (str[i] === token) ind++
  }
  return ind
}

/**
 * @param {string} path
 * @returns {string}
 *
 * @see https://datatracker.ietf.org/doc/html/rfc3986#section-5.2.4
 */
function removeDotSegments (path) {
  let input = path
  const output = []
  let nextSlash = -1
  let len = 0

  // eslint-disable-next-line no-cond-assign
  while (len = input.length) {
    if (len === 1) {
      if (input === '.') {
        break
      } else if (input === '/') {
        output.push('/')
        break
      } else {
        output.push(input)
        break
      }
    } else if (len === 2) {
      if (input[0] === '.') {
        if (input[1] === '.') {
          break
        } else if (input[1] === '/') {
          input = input.slice(2)
          continue
        }
      } else if (input[0] === '/') {
        if (input[1] === '.' || input[1] === '/') {
          output.push('/')
          break
        }
      }
    } else if (len === 3) {
      if (input === '/..') {
        if (output.length !== 0) {
          output.pop()
        }
        output.push('/')
        break
      }
    }
    if (input[0] === '.') {
      if (input[1] === '.') {
        if (input[2] === '/') {
          input = input.slice(3)
          continue
        }
      } else if (input[1] === '/') {
        input = input.slice(2)
        continue
      }
    } else if (input[0] === '/') {
      if (input[1] === '.') {
        if (input[2] === '/') {
          input = input.slice(2)
          continue
        } else if (input[2] === '.') {
          if (input[3] === '/') {
            input = input.slice(3)
            if (output.length !== 0) {
              output.pop()
            }
            continue
          }
        }
      }
    }

    // Rule 2E: Move normal path segment to output
    if ((nextSlash = input.indexOf('/', 1)) === -1) {
      output.push(input)
      break
    } else {
      output.push(input.slice(0, nextSlash))
      input = input.slice(nextSlash)
    }
  }

  return output.join('')
}

/**
 * Re-escape RFC 3986 gen-delims that must not appear literally in the host.
 * After the URI regex parses, these characters cannot be literal in the host
 * field, so any that appear after decoding came from percent-encoding and
 * must be restored to prevent authority structure changes.
 *
 * @param {string} host
 * @param {boolean} isIP - true for IPv4/IPv6 hosts (skip colon re-escaping)
 * @returns {string}
 */
const HOST_DELIMS = { '@': '%40', '/': '%2F', '?': '%3F', '#': '%23', ':': '%3A' }
const HOST_DELIM_RE = /[@/?#:]/g
const HOST_DELIM_NO_COLON_RE = /[@/?#]/g

function reescapeHostDelimiters (host, isIP) {
  const re = isIP ? HOST_DELIM_NO_COLON_RE : HOST_DELIM_RE
  re.lastIndex = 0
  return host.replace(re, (ch) => HOST_DELIMS[ch])
}

/**
 * Normalizes percent escapes and optionally decodes only unreserved ASCII bytes.
 * Reserved delimiters such as `%2F` and `%2E` stay escaped.
 *
 * @param {string} input
 * @param {boolean} [decodeUnreserved=false]
 * @returns {string}
 */
function normalizePercentEncoding (input, decodeUnreserved = false) {
  if (input.indexOf('%') === -1) {
    return input
  }

  let output = ''

  for (let i = 0; i < input.length; i++) {
    if (input[i] === '%' && i + 2 < input.length) {
      const hex = input.slice(i + 1, i + 3)
      if (isHexPair(hex)) {
        const normalizedHex = hex.toUpperCase()
        const decoded = String.fromCharCode(parseInt(normalizedHex, 16))

        if (decodeUnreserved && isUnreserved(decoded)) {
          output += decoded
        } else {
          output += '%' + normalizedHex
        }

        i += 2
        continue
      }
    }

    output += input[i]
  }

  return output
}

/**
 * Normalizes path data without turning reserved escapes into live path syntax.
 * Valid escapes are uppercased, raw unsafe characters are escaped, and only
 * unreserved bytes that are not `.` are decoded.
 *
 * @param {string} input
 * @returns {string}
 */
function normalizePathEncoding (input) {
  let output = ''

  for (let i = 0; i < input.length; i++) {
    if (input[i] === '%' && i + 2 < input.length) {
      const hex = input.slice(i + 1, i + 3)
      if (isHexPair(hex)) {
        const normalizedHex = hex.toUpperCase()
        const decoded = String.fromCharCode(parseInt(normalizedHex, 16))

        if (decoded !== '.' && isUnreserved(decoded)) {
          output += decoded
        } else {
          output += '%' + normalizedHex
        }

        i += 2
        continue
      }
    }

    if (isPathCharacter(input[i])) {
      output += input[i]
    } else {
      output += escape(input[i])
    }
  }

  return output
}

/**
 * Escapes a component while preserving existing valid percent escapes.
 *
 * @param {string} input
 * @returns {string}
 */
function escapePreservingEscapes (input) {
  let output = ''

  for (let i = 0; i < input.length; i++) {
    if (input[i] === '%' && i + 2 < input.length) {
      const hex = input.slice(i + 1, i + 3)
      if (isHexPair(hex)) {
        output += '%' + hex.toUpperCase()
        i += 2
        continue
      }
    }

    output += escape(input[i])
  }

  return output
}

/**
 * @param {import('../types/index').URIComponent} component
 * @returns {string|undefined}
 */
function recomposeAuthority (component) {
  const uriTokens = []

  if (component.userinfo !== undefined) {
    uriTokens.push(component.userinfo)
    uriTokens.push('@')
  }

  if (component.host !== undefined) {
    let host = unescape(component.host)
    if (!isIPv4(host)) {
      const ipV6res = normalizeIPv6(host)
      if (ipV6res.isIPV6 === true) {
        host = `[${ipV6res.escapedHost}]`
      } else {
        host = reescapeHostDelimiters(host, false)
      }
    }
    uriTokens.push(host)
  }

  if (typeof component.port === 'number' || typeof component.port === 'string') {
    uriTokens.push(':')
    uriTokens.push(String(component.port))
  }

  return uriTokens.length ? uriTokens.join('') : undefined
};

module.exports = {
  nonSimpleDomain,
  recomposeAuthority,
  reescapeHostDelimiters,
  normalizePercentEncoding,
  normalizePathEncoding,
  escapePreservingEscapes,
  removeDotSegments,
  isIPv4,
  isUUID,
  normalizeIPv6,
  stringArrayToHexStripped
}


},
33570(module) {
module.exports = JSON.parse('{"enum":["0BSD","3D-Slicer-1.0","AAL","Abstyles","AdaCore-doc","Adobe-2006","Adobe-Display-PostScript","Adobe-Glyph","Adobe-Utopia","ADSL","Advanced-Cryptics-Dictionary","AFL-1.1","AFL-1.2","AFL-2.0","AFL-2.1","AFL-3.0","Afmparse","AGPL-1.0","AGPL-1.0-only","AGPL-1.0-or-later","AGPL-3.0","AGPL-3.0-only","AGPL-3.0-or-later","Aladdin","ALGLIB-Documentation","AMD-newlib","AMDPLPA","AML","AML-glslang","AMPAS","ANTLR-PD","ANTLR-PD-fallback","any-OSI","any-OSI-perl-modules","Apache-1.0","Apache-1.1","Apache-2.0","APAFML","APL-1.0","App-s2p","APSL-1.0","APSL-1.1","APSL-1.2","APSL-2.0","Arphic-1999","Artistic-1.0","Artistic-1.0-cl8","Artistic-1.0-Perl","Artistic-2.0","Artistic-dist","Aspell-RU","ASWF-Digital-Assets-1.0","ASWF-Digital-Assets-1.1","Baekmuk","Bahyph","Barr","bcrypt-Solar-Designer","Beerware","Bitstream-Charter","Bitstream-Vera","BitTorrent-1.0","BitTorrent-1.1","blessing","BlueOak-1.0.0","Boehm-GC","Boehm-GC-without-fee","BOLA-1.1","Borceux","Brian-Gladman-2-Clause","Brian-Gladman-3-Clause","BSD-1-Clause","BSD-2-Clause","BSD-2-Clause-Darwin","BSD-2-Clause-first-lines","BSD-2-Clause-FreeBSD","BSD-2-Clause-NetBSD","BSD-2-Clause-Patent","BSD-2-Clause-pkgconf-disclaimer","BSD-2-Clause-Views","BSD-3-Clause","BSD-3-Clause-acpica","BSD-3-Clause-Attribution","BSD-3-Clause-Clear","BSD-3-Clause-flex","BSD-3-Clause-HP","BSD-3-Clause-LBNL","BSD-3-Clause-Modification","BSD-3-Clause-No-Military-License","BSD-3-Clause-No-Nuclear-License","BSD-3-Clause-No-Nuclear-License-2014","BSD-3-Clause-No-Nuclear-Warranty","BSD-3-Clause-Open-MPI","BSD-3-Clause-Sun","BSD-3-Clause-Tso","BSD-4-Clause","BSD-4-Clause-Shortened","BSD-4-Clause-UC","BSD-4.3RENO","BSD-4.3TAHOE","BSD-Advertising-Acknowledgement","BSD-Attribution-HPND-disclaimer","BSD-Inferno-Nettverk","BSD-Mark-Modifications","BSD-Protection","BSD-Source-beginning-file","BSD-Source-Code","BSD-Systemics","BSD-Systemics-W3Works","BSL-1.0","Buddy","BUSL-1.1","bzip2-1.0.5","bzip2-1.0.6","C-UDA-1.0","CAL-1.0","CAL-1.0-Combined-Work-Exception","Caldera","Caldera-no-preamble","CAPEC-tou","Catharon","CATOSL-1.1","CC-BY-1.0","CC-BY-2.0","CC-BY-2.5","CC-BY-2.5-AU","CC-BY-3.0","CC-BY-3.0-AT","CC-BY-3.0-AU","CC-BY-3.0-DE","CC-BY-3.0-IGO","CC-BY-3.0-NL","CC-BY-3.0-US","CC-BY-4.0","CC-BY-NC-1.0","CC-BY-NC-2.0","CC-BY-NC-2.5","CC-BY-NC-3.0","CC-BY-NC-3.0-DE","CC-BY-NC-4.0","CC-BY-NC-ND-1.0","CC-BY-NC-ND-2.0","CC-BY-NC-ND-2.5","CC-BY-NC-ND-3.0","CC-BY-NC-ND-3.0-DE","CC-BY-NC-ND-3.0-IGO","CC-BY-NC-ND-4.0","CC-BY-NC-SA-1.0","CC-BY-NC-SA-2.0","CC-BY-NC-SA-2.0-DE","CC-BY-NC-SA-2.0-FR","CC-BY-NC-SA-2.0-UK","CC-BY-NC-SA-2.5","CC-BY-NC-SA-3.0","CC-BY-NC-SA-3.0-DE","CC-BY-NC-SA-3.0-IGO","CC-BY-NC-SA-4.0","CC-BY-ND-1.0","CC-BY-ND-2.0","CC-BY-ND-2.5","CC-BY-ND-3.0","CC-BY-ND-3.0-DE","CC-BY-ND-4.0","CC-BY-SA-1.0","CC-BY-SA-2.0","CC-BY-SA-2.0-UK","CC-BY-SA-2.1-JP","CC-BY-SA-2.5","CC-BY-SA-3.0","CC-BY-SA-3.0-AT","CC-BY-SA-3.0-DE","CC-BY-SA-3.0-IGO","CC-BY-SA-4.0","CC-PDDC","CC-PDM-1.0","CC-SA-1.0","CC0-1.0","CDDL-1.0","CDDL-1.1","CDL-1.0","CDLA-Permissive-1.0","CDLA-Permissive-2.0","CDLA-Sharing-1.0","CECILL-1.0","CECILL-1.1","CECILL-2.0","CECILL-2.1","CECILL-B","CECILL-C","CERN-OHL-1.1","CERN-OHL-1.2","CERN-OHL-P-2.0","CERN-OHL-S-2.0","CERN-OHL-W-2.0","CFITSIO","check-cvs","checkmk","ClArtistic","Clips","CMU-Mach","CMU-Mach-nodoc","CNRI-Jython","CNRI-Python","CNRI-Python-GPL-Compatible","COIL-1.0","Community-Spec-1.0","Condor-1.1","copyleft-next-0.3.0","copyleft-next-0.3.1","Cornell-Lossless-JPEG","CPAL-1.0","CPL-1.0","CPOL-1.02","Cronyx","Crossword","CryptoSwift","CrystalStacker","CUA-OPL-1.0","Cube","curl","cve-tou","D-FSL-1.0","DEC-3-Clause","diffmark","DL-DE-BY-2.0","DL-DE-ZERO-2.0","DOC","DocBook-DTD","DocBook-Schema","DocBook-Stylesheet","DocBook-XML","Dotseqn","DRL-1.0","DRL-1.1","DSDP","dtoa","dvipdfm","ECL-1.0","ECL-2.0","eCos-2.0","EFL-1.0","EFL-2.0","eGenix","Elastic-2.0","Entessa","EPICS","EPL-1.0","EPL-2.0","ErlPL-1.1","ESA-PL-permissive-2.4","ESA-PL-strong-copyleft-2.4","ESA-PL-weak-copyleft-2.4","etalab-2.0","EUDatagrid","EUPL-1.0","EUPL-1.1","EUPL-1.2","Eurosym","Fair","FBM","FDK-AAC","Ferguson-Twofish","Frameworx-1.0","FreeBSD-DOC","FreeImage","FSFAP","FSFAP-no-warranty-disclaimer","FSFUL","FSFULLR","FSFULLRSD","FSFULLRWD","FSL-1.1-ALv2","FSL-1.1-MIT","FTL","Furuseth","fwlw","Game-Programming-Gems","GCR-docs","GD","generic-xts","GFDL-1.1","GFDL-1.1-invariants-only","GFDL-1.1-invariants-or-later","GFDL-1.1-no-invariants-only","GFDL-1.1-no-invariants-or-later","GFDL-1.1-only","GFDL-1.1-or-later","GFDL-1.2","GFDL-1.2-invariants-only","GFDL-1.2-invariants-or-later","GFDL-1.2-no-invariants-only","GFDL-1.2-no-invariants-or-later","GFDL-1.2-only","GFDL-1.2-or-later","GFDL-1.3","GFDL-1.3-invariants-only","GFDL-1.3-invariants-or-later","GFDL-1.3-no-invariants-only","GFDL-1.3-no-invariants-or-later","GFDL-1.3-only","GFDL-1.3-or-later","Giftware","GL2PS","Glide","Glulxe","GLWTPL","gnuplot","GPL-1.0","GPL-1.0+","GPL-1.0-only","GPL-1.0-or-later","GPL-2.0","GPL-2.0+","GPL-2.0-only","GPL-2.0-or-later","GPL-2.0-with-autoconf-exception","GPL-2.0-with-bison-exception","GPL-2.0-with-classpath-exception","GPL-2.0-with-font-exception","GPL-2.0-with-GCC-exception","GPL-3.0","GPL-3.0+","GPL-3.0-only","GPL-3.0-or-later","GPL-3.0-with-autoconf-exception","GPL-3.0-with-GCC-exception","Graphics-Gems","gSOAP-1.3b","gtkbook","Gutmann","HaskellReport","HDF5","hdparm","HIDAPI","Hippocratic-2.1","HP-1986","HP-1989","HPND","HPND-DEC","HPND-doc","HPND-doc-sell","HPND-export-US","HPND-export-US-acknowledgement","HPND-export-US-modify","HPND-export2-US","HPND-Fenneberg-Livingston","HPND-INRIA-IMAG","HPND-Intel","HPND-Kevlin-Henney","HPND-Markus-Kuhn","HPND-merchantability-variant","HPND-MIT-disclaimer","HPND-Netrek","HPND-Pbmplus","HPND-sell-MIT-disclaimer-xserver","HPND-sell-regexpr","HPND-sell-variant","HPND-sell-variant-critical-systems","HPND-sell-variant-MIT-disclaimer","HPND-sell-variant-MIT-disclaimer-rev","HPND-SMC","HPND-UC","HPND-UC-export-US","HTMLTIDY","hyphen-bulgarian","IBM-pibs","ICU","IEC-Code-Components-EULA","IJG","IJG-short","ImageMagick","iMatix","Imlib2","Info-ZIP","Inner-Net-2.0","InnoSetup","Intel","Intel-ACPI","Interbase-1.0","IPA","IPL-1.0","ISC","ISC-Veillard","ISO-permission","Jam","JasPer-2.0","jove","JPL-image","JPNIC","JSON","Kastrup","Kazlib","Knuth-CTAN","LAL-1.2","LAL-1.3","Latex2e","Latex2e-translated-notice","Leptonica","LGPL-2.0","LGPL-2.0+","LGPL-2.0-only","LGPL-2.0-or-later","LGPL-2.1","LGPL-2.1+","LGPL-2.1-only","LGPL-2.1-or-later","LGPL-3.0","LGPL-3.0+","LGPL-3.0-only","LGPL-3.0-or-later","LGPLLR","Libpng","libpng-1.6.35","libpng-2.0","libselinux-1.0","libtiff","libutil-David-Nugent","LiLiQ-P-1.1","LiLiQ-R-1.1","LiLiQ-Rplus-1.1","Linux-man-pages-1-para","Linux-man-pages-copyleft","Linux-man-pages-copyleft-2-para","Linux-man-pages-copyleft-var","Linux-OpenIB","LOOP","LPD-document","LPL-1.0","LPL-1.02","LPPL-1.0","LPPL-1.1","LPPL-1.2","LPPL-1.3a","LPPL-1.3c","lsof","Lucida-Bitmap-Fonts","LZMA-SDK-9.11-to-9.20","LZMA-SDK-9.22","Mackerras-3-Clause","Mackerras-3-Clause-acknowledgment","magaz","mailprio","MakeIndex","man2html","Martin-Birgmeier","McPhee-slideshow","metamail","Minpack","MIPS","MirOS","MIT","MIT-0","MIT-advertising","MIT-Click","MIT-CMU","MIT-enna","MIT-feh","MIT-Festival","MIT-Khronos-old","MIT-Modern-Variant","MIT-open-group","MIT-STK","MIT-testregex","MIT-Wu","MITNFA","MMIXware","MMPL-1.0.1","Motosoto","MPEG-SSG","mpi-permissive","mpich2","MPL-1.0","MPL-1.1","MPL-2.0","MPL-2.0-no-copyleft-exception","mplus","MS-LPL","MS-PL","MS-RL","MTLL","MulanPSL-1.0","MulanPSL-2.0","Multics","Mup","NAIST-2003","NASA-1.3","Naumen","NBPL-1.0","NCBI-PD","NCGL-UK-2.0","NCL","NCSA","Net-SNMP","NetCDF","Newsletr","NGPL","ngrep","NICTA-1.0","NIST-PD","NIST-PD-fallback","NIST-PD-TNT","NIST-Software","NLOD-1.0","NLOD-2.0","NLPL","Nokia","NOSL","Noweb","NPL-1.0","NPL-1.1","NPOSL-3.0","NRL","NTIA-PD","NTP","NTP-0","Nunit","O-UDA-1.0","OAR","OCCT-PL","OCLC-2.0","ODbL-1.0","ODC-By-1.0","OFFIS","OFL-1.0","OFL-1.0-no-RFN","OFL-1.0-RFN","OFL-1.1","OFL-1.1-no-RFN","OFL-1.1-RFN","OGC-1.0","OGDL-Taiwan-1.0","OGL-Canada-2.0","OGL-UK-1.0","OGL-UK-2.0","OGL-UK-3.0","OGTSL","OLDAP-1.1","OLDAP-1.2","OLDAP-1.3","OLDAP-1.4","OLDAP-2.0","OLDAP-2.0.1","OLDAP-2.1","OLDAP-2.2","OLDAP-2.2.1","OLDAP-2.2.2","OLDAP-2.3","OLDAP-2.4","OLDAP-2.5","OLDAP-2.6","OLDAP-2.7","OLDAP-2.8","OLFL-1.3","OML","OpenMDW-1.0","OpenPBS-2.3","OpenSSL","OpenSSL-standalone","OpenVision","OPL-1.0","OPL-UK-3.0","OPUBL-1.0","OSC-1.0","OSET-PL-2.1","OSL-1.0","OSL-1.1","OSL-2.0","OSL-2.1","OSL-3.0","OSSP","PADL","ParaType-Free-Font-1.3","Parity-6.0.0","Parity-7.0.0","PDDL-1.0","PHP-3.0","PHP-3.01","Pixar","pkgconf","Plexus","pnmstitch","PolyForm-Noncommercial-1.0.0","PolyForm-Small-Business-1.0.0","PostgreSQL","PPL","PSF-2.0","psfrag","psutils","Python-2.0","Python-2.0.1","python-ldap","Qhull","QPL-1.0","QPL-1.0-INRIA-2004","radvd","Rdisc","RHeCos-1.1","RPL-1.1","RPL-1.5","RPSL-1.0","RSA-MD","RSCPL","Ruby","Ruby-pty","SAX-PD","SAX-PD-2.0","Saxpath","SCEA","SchemeReport","Sendmail","Sendmail-8.23","Sendmail-Open-Source-1.1","SGI-B-1.0","SGI-B-1.1","SGI-B-2.0","SGI-OpenGL","SGMLUG-PM","SGP4","SHL-0.5","SHL-0.51","SimPL-2.0","SISSL","SISSL-1.2","SL","Sleepycat","SMAIL-GPL","SMLNJ","SMPPL","SNIA","snprintf","SOFA","softSurfer","Soundex","Spencer-86","Spencer-94","Spencer-99","SPL-1.0","ssh-keyscan","SSH-OpenSSH","SSH-short","SSLeay-standalone","SSPL-1.0","StandardML-NJ","SugarCRM-1.1.3","SUL-1.0","Sun-PPP","Sun-PPP-2000","SunPro","SWL","swrule","Symlinks","TAPR-OHL-1.0","TCL","TCP-wrappers","TekHVC","TermReadKey","TGPPL-1.0","ThirdEye","threeparttable","TMate","TORQUE-1.1","TOSL","TPDL","TPL-1.0","TrustedQSL","TTWL","TTYP0","TU-Berlin-1.0","TU-Berlin-2.0","Ubuntu-font-1.0","UCAR","UCL-1.0","ulem","UMich-Merit","Unicode-3.0","Unicode-DFS-2015","Unicode-DFS-2016","Unicode-TOU","UnixCrypt","Unlicense","Unlicense-libtelnet","Unlicense-libwhirlpool","UnRAR","UPL-1.0","URT-RLE","Vim","Vixie-Cron","VOSTROM","VSL-1.0","W3C","W3C-19980720","W3C-20150513","w3m","Watcom-1.0","Widget-Workshop","WordNet","Wsuipa","WTFNMFPL","WTFPL","wwl","wxWindows","X11","X11-distribute-modifications-variant","X11-no-permit-persons","X11-swapped","Xdebug-1.03","Xerox","Xfig","XFree86-1.1","xinetd","xkeyboard-config-Zinoviev","xlock","Xnet","xpp","XSkat","xzoom","YPL-1.0","YPL-1.1","Zed","Zeeff","Zend-2.0","Zimbra-1.3","Zimbra-1.4","Zlib","zlib-acknowledgement","ZPL-1.1","ZPL-2.0","ZPL-2.1","389-exception","Asterisk-exception","Asterisk-linking-protocols-exception","Autoconf-exception-2.0","Autoconf-exception-3.0","Autoconf-exception-generic","Autoconf-exception-generic-3.0","Autoconf-exception-macro","Bison-exception-1.24","Bison-exception-2.2","Bootloader-exception","CGAL-linking-exception","Classpath-exception-2.0","Classpath-exception-2.0-short","CLISP-exception-2.0","cryptsetup-OpenSSL-exception","Digia-Qt-LGPL-exception-1.1","DigiRule-FOSS-exception","eCos-exception-2.0","erlang-otp-linking-exception","Fawkes-Runtime-exception","FLTK-exception","fmt-exception","Font-exception-2.0","freertos-exception-2.0","GCC-exception-2.0","GCC-exception-2.0-note","GCC-exception-3.1","Gmsh-exception","GNAT-exception","GNOME-examples-exception","GNU-compiler-exception","gnu-javamail-exception","GPL-3.0-389-ds-base-exception","GPL-3.0-interface-exception","GPL-3.0-linking-exception","GPL-3.0-linking-source-exception","GPL-CC-1.0","GStreamer-exception-2005","GStreamer-exception-2008","harbour-exception","i2p-gpl-java-exception","Independent-modules-exception","KiCad-libraries-exception","kvirc-openssl-exception","LGPL-3.0-linking-exception","libpri-OpenH323-exception","Libtool-exception","Linux-syscall-note","LLGPL","LLVM-exception","LZMA-exception","mif-exception","mxml-exception","Nokia-Qt-exception-1.1","OCaml-LGPL-linking-exception","OCCT-exception-1.0","OpenJDK-assembly-exception-1.0","openvpn-openssl-exception","PCRE2-exception","polyparse-exception","PS-or-PDF-font-exception-20170817","QPL-1.0-INRIA-2004-exception","Qt-GPL-exception-1.0","Qt-LGPL-exception-1.1","Qwt-exception-1.0","romic-exception","RRDtool-FLOSS-exception-2.0","rsync-linking-exception","SANE-exception","SHL-2.0","SHL-2.1","Simple-Library-Usage-exception","sqlitestudio-OpenSSL-exception","stunnel-exception","SWI-exception","Swift-exception","Texinfo-exception","u-boot-exception-2.0","UBDL-exception","Universal-FOSS-exception-1.0","vsftpd-openssl-exception","WxWindows-exception-3.1","x11vnc-openssl-exception"]}')

},
36509(module) {
module.exports = JSON.parse('{"$id":"https://raw.githubusercontent.com/ajv-validator/ajv/master/lib/refs/data.json#","description":"Meta-schema for $data reference (JSON AnySchema extension proposal)","type":"object","required":["$data"],"properties":{"$data":{"type":"string","anyOf":[{"format":"relative-json-pointer"},{"format":"json-pointer"}]}},"additionalProperties":false}')

},
93519(module) {
module.exports = JSON.parse('{"$schema":"http://json-schema.org/draft-07/schema#","$id":"http://json-schema.org/draft-07/schema#","title":"Core schema meta-schema","definitions":{"schemaArray":{"type":"array","minItems":1,"items":{"$ref":"#"}},"nonNegativeInteger":{"type":"integer","minimum":0},"nonNegativeIntegerDefault0":{"allOf":[{"$ref":"#/definitions/nonNegativeInteger"},{"default":0}]},"simpleTypes":{"enum":["array","boolean","integer","null","number","object","string"]},"stringArray":{"type":"array","items":{"type":"string"},"uniqueItems":true,"default":[]}},"type":["object","boolean"],"properties":{"$id":{"type":"string","format":"uri-reference"},"$schema":{"type":"string","format":"uri"},"$ref":{"type":"string","format":"uri-reference"},"$comment":{"type":"string"},"title":{"type":"string"},"description":{"type":"string"},"default":true,"readOnly":{"type":"boolean","default":false},"examples":{"type":"array","items":true},"multipleOf":{"type":"number","exclusiveMinimum":0},"maximum":{"type":"number"},"exclusiveMaximum":{"type":"number"},"minimum":{"type":"number"},"exclusiveMinimum":{"type":"number"},"maxLength":{"$ref":"#/definitions/nonNegativeInteger"},"minLength":{"$ref":"#/definitions/nonNegativeIntegerDefault0"},"pattern":{"type":"string","format":"regex"},"additionalItems":{"$ref":"#"},"items":{"anyOf":[{"$ref":"#"},{"$ref":"#/definitions/schemaArray"}],"default":true},"maxItems":{"$ref":"#/definitions/nonNegativeInteger"},"minItems":{"$ref":"#/definitions/nonNegativeIntegerDefault0"},"uniqueItems":{"type":"boolean","default":false},"contains":{"$ref":"#"},"maxProperties":{"$ref":"#/definitions/nonNegativeInteger"},"minProperties":{"$ref":"#/definitions/nonNegativeIntegerDefault0"},"required":{"$ref":"#/definitions/stringArray"},"additionalProperties":{"$ref":"#"},"definitions":{"type":"object","additionalProperties":{"$ref":"#"},"default":{}},"properties":{"type":"object","additionalProperties":{"$ref":"#"},"default":{}},"patternProperties":{"type":"object","additionalProperties":{"$ref":"#"},"propertyNames":{"format":"regex"},"default":{}},"dependencies":{"type":"object","additionalProperties":{"anyOf":[{"$ref":"#"},{"$ref":"#/definitions/stringArray"}]}},"propertyNames":{"$ref":"#"},"const":true,"enum":{"type":"array","items":true,"minItems":1,"uniqueItems":true},"type":{"anyOf":[{"$ref":"#/definitions/simpleTypes"},{"type":"array","items":{"$ref":"#/definitions/simpleTypes"},"minItems":1,"uniqueItems":true}]},"format":{"type":"string"},"contentMediaType":{"type":"string"},"contentEncoding":{"type":"string"},"if":{"$ref":"#"},"then":{"$ref":"#"},"else":{"$ref":"#"},"allOf":{"$ref":"#/definitions/schemaArray"},"anyOf":{"$ref":"#/definitions/schemaArray"},"oneOf":{"$ref":"#/definitions/schemaArray"},"not":{"$ref":"#"}},"default":true}')

},

};
