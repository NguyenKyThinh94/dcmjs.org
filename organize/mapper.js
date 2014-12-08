// FIXMEs:
// - clone $dicomDOM more easily
// - need a function to create NEW tags in $dicomDOM (see broken implementation in mapDom function)
// - remove private tags unless specified OK (temp solution)
// - optional selector to remove everything that's not in tagNamesToAlwaysKeep (mapdefaults.js)
//  --> keep special tags! and just check "element" kids of "data-set" (leave meta-header alone)
//   (these tags are defined, but no logic exists yet)
// - verify hashUID function
// - pass filepaths
// - pass a mapfile

// - bug: if in getSpeificReplacer.dicom: 'TagName': function() {return "mystring"} doesn't ADD the tag if not there.

// example setup
var mappingTable = [
    ['anonymous', 'mappedname', 1],
    ['2766852498', 'AnonymousPatient', 1],
    ['', 'wasempty', 5]
];

// this describes the expectations of where file path components are found in case
// they are needed for populating dicom or for saving
// -> need to retrieve this from UI, maybe even by presenting the user the file path of first
// dicom found and asking them to enter this string below
var filePathPattern = 'trialname/centersubj/dicomstudyid/dicomseriesid/';

// this number describes how many path components (of the PROCESSED file path) are grouped
// in a single zip file. The zip files are labeled according to the grouping.
var zipGroupLevel = 2;

// from mapdefaults.js
var defaultEmpty = tagNamesToEmpty;
var replaceUIDs = instanceUIDs;

// TODO: extract below specific instructions from UI
var getSpecificReplacer = function(parser) {
    return {
        dicom: {
            // just set a date
            'PatientID': function() {
                return "newID";
            },
            // this example replaces the patient name per mapping table columns 0 (original) and 1 (target)
            'PatientName': function() {
                return parser.getMapped(parser.getDicom('PatientName'), 0, 1);
            },
            // this example finds the patientname in mapping table column 0 and offsets the date by days per column 2
            'StudyDate': function() {
                return addDays(parser.getDicom('StudyDate'), parser.getMapped(parser.getDicom('PatientName'), 0, 2));
            },
        },
        // filePath lists the component of the new path. Component names if taken from old filePath must
        // be available in filePathPattern, and actual file path depth must obviously be greater than
        // the index at which the argument to getFilePathComp() is found in filePathPattern
        filePath: [
            parser.getFilePathComp('trialname'),
            // TODO: this gets access to the old/non-mapped PatientID. Compare also the getDicom for UIDs.
            // probably mapping layer should be more orthogonal to spcific replace functions,
            // and instead, getter functions always retrieve mapped values.
            // Also, distinguish case of mapping vs just entering new tag content via specificReplacer
            parser.getFilePathComp('centersubj') + "_" + parser.getDicom('PatientID'),
            parser.getDicom('StudyDate'),
            parser.getDicom('SeriesDescription') + "_" + parser.getDicom('SeriesNumber'),
            parser.getDicom('InstanceNumber') + ".dcm"
        ]
    };
};


// (parser is created once per run)
// TODO: var mapTable = list of lists read from mappingFilePath
var getParser = function($oldDicomDom, mapTable, filePath, filePathPattern, options, status) {
    return {
        getMapped: function(matchValue, matchIndex, newIndex) {
            var mapRow = mapTable.filter(function(row) {
                return row[matchIndex] === matchValue;
            });
            if (mapRow.length) {
                return mapRow[0][newIndex];
            } else {
                status.mapFailed = true;
                // TODO: create a downloadable log
                var issue = ("No value '" + matchValue +
                      "' found in mapping table column " + matchIndex);
                status.log.push(issue);
                options.status(issue);
                if (options.requireMapping) {
                  throw(issue);
                }
            }
        },
        // compName should be in filePathCompNames
        getFilePathComp: function(compName) {
            var filePathCompNames = filePathPattern.replace(/^\/|\/$/g, '').split('/');
            var idx = filePathCompNames.indexOf(compName);
            // slice: path starts with / and first split is ""
            var pathComps = filePath.split("/").slice(1);
            if (idx == -1 || idx >= pathComps.length) {
                var issue;
                if (idx == -1) {
                    issue = "path component name not found in component names list";
                }
                if (idx >= pathComps.length) {
                    issue = "the specified path component is deeper than the available directory hierarchy";
                }
                status.filePathFailed = true;
                status.log.push(issue);
                options.status(issue);
                if (options.requireDirectoryParsing) {
                    throw(issue);
                }
                return "invalidpath";
            }
            return pathComps[idx];
        },
        getDicom: function(tagName) {
            var ret = $oldDicomDom.find('[name=' + tagName + ']').text();
            // we do this check so that a specific operation never gets access
            // to the old UIDs but always the new ones
            if (replaceUIDs.indexOf(tagName) > -1) {
                ret = hashUID(ret);
            }
            return ret;
        }
    };
};


function addDays(dcmDate, numDays) {
    // just to make sure
    dcmDate = String(dcmDate);
    // month is 0 based!
    var origDate = new Date(dcmDate.substring(0,4), dcmDate.substring(4, 6) - 1, dcmDate.substring(6, 8));
    var newDate = new Date(origDate);
    newDate.setDate(newDate.getDate() + numDays);
    return newDate.getFullYear() + ('0' + String(parseInt(newDate.getMonth(), 10) + 1)).slice(-2) + ('0' + newDate.getDate()).slice(-2);
}

// make file path components file system safe
var cleanFilePath = function(arr) {
    return arr.map(function(comp) {
        return encodeURIComponent(comp.replace(/[ \/]/g, '_')) || "unavailable";
    });
};

// tag manipulation functions
// empty if present
function tagEmpty(jQDom, name) {
    jQDom.find('[name=' + name + ']').text("");
}

function tagReplace(jQDom, name, value) {
    // (ensure it's used as a setter with the || "")
    jQDom.find('[name=' + name + ']').text(value || "");
}

// example implementation
function tagInsert(jQDom) {
    jQDom.find("data-set").append($(
        "<element " +
            "name='PatientIdentityRemoved'" +
            "tag = '0012,0062'" +
            "vr = 'CS'" +
        ">").append("YES"));
    console.log("tagInsert done");
}

function hashUID(uid) {

    /*
     * comment references:
     * [1]: http://www.itu.int/rec/T-REC-X.667-201210-I/en
     */

    // FIXME: UUID calculation may not be working correctly.
    function hexStrToBytes(str) {
        var result = [];
        while (str.length >= 2) { 
            result.push(parseInt(str.substring(0, 2), 16));
            str = str.substring(2, str.length);
        }

        return result;
    }
    function byteToHexStr(b) {
        return ((b >> 4) & 0x0f).toString(16) + (b & 0x0f).toString(16);
    }

    // verify whether the dicom UID byte representation is a byte representation of strings,
    // or does the uid need to be converted before? (question is referenced below)
    function dicomUidToBytes(uid) {
        var bytes = [];
        for (var i = 0; i < uid.length; ++i) {
            bytes.push(uid.charCodeAt(i));
        }
        return bytes;
    }

    // we're following [1], 14, sub-case 14.3 (SHA1 based)
    // 14.1 bullet 1
    // allocating the namespace for OID based UUIDs
    // from: [1], D.9 "Name string is an OID"
    var nsUUID = "6ba7b8129dad11d180b400c04fd430c8";

    // 14.1 bullet 2, convert name to canonical seq of octets (idea tb verified)
    var nsUUIDBytes = hexStrToBytes(nsUUID);

    // 14.1, bullet 3, compute 16-octet hash value of name space identifier concatenated with name,
    // using SHA-1. (The sentence with "the numbering is..." is tb verified - byte sequence ok?).
    // This hash value is calculated per 14.3. Just quick verification of byte sequence required
    // Question: the DICOM UID is a string - does it need any conversion before hashing? Here I assume not.
    var uidBytes = dicomUidToBytes(uid);
    // Compute the final 16-octet hash value of the name space identifier concatenated with the name
    // First concatenate
    var concatBytes = nsUUIDBytes.concat(uidBytes);
    // in order to hash the bytes, here I'm converting them to a string first.
    var concatAsString = concatBytes.map(function(c){return String.fromCharCode(parseInt(c, 10));}).join("");
    // Then I apply the sha1 on the string.
    // Question: does sha1() do the right thing? Can we compare to any other sha1 given same input? (
    // ideally the byte input). I'm actually pretty sure it's not the right thing, as I've tested it against
    // the example on http://de.wikipedia.org/wiki/Universally_Unique_Identifier.
    // --> The bytes match but the calculated hash is not the same.
    // Maybe because strings with non-UTF-8 chars get modified inside sha1() -> better sha1 available?
    var hashValue = sha1(concatAsString);
    // 14.1, bullets 4-6:
    // Set octets 3 through 0 of the "TimeLow" field to octets 3 through 0 of the hash value.
    // Set octets 1 and 0 of the "TimeMid" field to octets 5 and 4 of the hash value.
    // Set octets 1 and 0 of the "VersionAndTimeHigh" field to octets 7 and 6 of the hash value.
    // Question: is there any rearrangement taking place or is the outcome just identical to the
    // byte representation of hashValue? (if yes, I won't need the hashBytes variable for now and stick to the hex hashValue)
    var hashBytes = hexStrToBytes(hashValue);
    // 14.1, bullet 7: overwrite the four most sig bits... with the 4-bit version number from Table3 of 12.2..
    // -> in our case that's "0101" or 5
    // bullet 8: more placing of octets in sequence (?)
    // bullet 9: overwrite 2 most sig bits of VariantAndClockSeqHigh with 1 and 0
    // --> Question: I'm not sure on bullet 9, may have to do a bit level operation there, not sure hex rep
    // does it.
    // I did something pro forma (adding the string "9") but also placing needs to be reviewed
    // (and remaining bullets in 14.1: add rest of bytes in sequence, to be verified)
    // Btw: I truncate the hash to 16 octets = 32 hex values happens here.
    var nameUUID = hashValue.slice(0, 12) + "5" + hashValue.slice(13, 16) + "9" + hashValue.slice(17, 32);

    // finally, casting to a UID again. Need to convert nameUUID to an integer.
    // I'm doing this quick and dirty here, but the String casting may need some left padding
    // overall, this conversion needs a quick check
    return "2.25." + hexStrToBytes(nameUUID).join("");
}


var applyReplaceDefaults = function(jQDom, specificReplace, parser) {
    function unlessSpecified(tagList) {
        return tagList.filter(function(tag) {
            return !(tag in specificReplace.dicom);
        });
    }
    // empty all tags in defaultEmpty, unless there's a specific instruction
    // to do something else
    unlessSpecified(defaultEmpty).forEach(function(name) {
        tagEmpty(jQDom, name);
    });
    // hash all UIDs in replaceUID, unless there's a specific instruction
    // to do something else
    unlessSpecified(replaceUIDs).forEach(function(uidName) {
        // this is counterintuitive but getDicom already hashes UIDs, so
        // we can never use the original value. Just get the value
        // and replace the existing one
        tagReplace(jQDom, uidName, parser.getDicom(uidName));
    });
    // last, a few special cases
    // FIXME:
    tagInsert(jQDom);
    tagReplace(jQDom, "PatientIdentityRemoved", "YES");
    tagReplace(jQDom, "DeIdentificationMethod",
        parser.getDicom("DeIdentificationMethod") + "; dcmjs.org");

    // TODO: remove private groups and any tags here - this is currently done
    // in index.html on parsing DICOMs (private tags are just ignored there)
};

var removePrivateTags = function(jQDom) {
    jQDom.find("data-set > element").each(function() {
        var tag = this.getAttribute('tag');
        var tagIsPrivate = (Number("0x"+tag[3]) % 2 === 1);
        if (tagIsPrivate) {
            this.remove();
        }
    });
};

var removeNonWhitelistedTags = function(jQDom, whiteListTags, specialTags, instanceUids) {
    jQDom.find("data-set > element").each(function(idx, elm) {
        var name = elm.getAttribute('name');
        if (whiteListTags.concat(specialTags).concat(instanceUids)
                .indexOf(name) == -1) {
            elm.innerHTML = "";
        }
    });
};

// in main func:
// read from old dicom dom and write to new dicomdom
var mapDom = function(xmlString, filePath, mapFile, options) {
    var status = {log: [], mapFailed: false};
    options = options || {};
    if (!options.requireMapping) options.requireMapping = false;
    if (!options.requireDirectoryParsing) options.requireDirectoryParsing = false;
    if (!options.keepWhitelistedTagsOnly) options.keepWhitelistedTagsOnly = false;
    if (!options.keepPrivateTags) options.keepPrivateTags = false;

    // make a DOM to query and a DOM to update
    var $oldDicomDOM = $($.parseXML(xmlString));
    var $newDicomDOM = $($.parseXML(xmlString));

    // TODO: define filePath - should come in arguments
    var parser = getParser($oldDicomDOM, mappingTable, filePath, filePathPattern, options, status);
    var specificReplace = getSpecificReplacer(parser);

    // deal with specific replace instructions
    // the specific replace instructions are the the place where
    // the mapping table can be used
    Object.keys(specificReplace.dicom).forEach(function(name) {
        tagReplace($newDicomDOM, name, specificReplace.dicom[name]());
    });

    // find new path:
    var newFilePath = "/" + cleanFilePath(specificReplace.filePath).join("/");
    var zipFileName = specificReplace.filePath.slice(0, zipGroupLevel).join("__");

    applyReplaceDefaults($newDicomDOM, specificReplace, parser);

    if (!options.keepPrivateTags) {
        removePrivateTags($newDicomDOM);
    }

    if (options.keepWhitelistedTagsOnly) {
        removeNonWhitelistedTags($newDicomDOM, tagNamesToAlwaysKeep,
            Object.keys(specificReplace.dicom), instanceUIDs);
    }

    return {
        dicom: $newDicomDOM,
        status: status,
        filePath: newFilePath,
        zipFileName: zipFileName
    };
};
