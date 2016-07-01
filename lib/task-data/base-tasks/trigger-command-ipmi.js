// Copyright 2016, EMC, Inc.

'use strict';

module.exports = {
    friendlyName: 'Trigger IPMI command',
    injectableName: 'Task.Base.Trigger.Command.IPMI',
    runJob: 'Job.RunCommand.Ipmi',
    requiredOptions: [
        "command",
        "nodeId"
    ],
    requiredProperties: {},
    properties: {}
};
