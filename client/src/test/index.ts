/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
"use strict";

import * as testRunner from "vscode/lib/testrunner";

testRunner.configure({
    timeout: 100000,
    ui: "bdd",
    useColors: true,
});

module.exports = testRunner;
