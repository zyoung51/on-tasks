// Copyright 2016, EMC, Inc.

'use strict';

var di = require('di');

module.exports = ipmiRunCommandJobFactory;
di.annotate(ipmiRunCommandJobFactory, new di.Provide('Job.RunCommand.Ipmi'));
di.annotate(ipmiRunCommandJobFactory, new di.Inject(
    'Job.Base',
    'JobUtils.Ipmitool',
    'JobUtils.IpmiCommandParser',
    'Logger',
    'Util',
    'Assert',
    'Promise',
    '_',
    'Services.Waterline',
    'Services.Lookup',
    'Constants'
));

function ipmiRunCommandJobFactory(
    BaseJob,
    ipmitool,
    parser,
    Logger,
    util,
    assert,
    Promise,
    _,
    waterline,
    lookup,
    Constants
) {
    var logger = Logger.initialize(ipmiRunCommandJobFactory);

    /**
     *
     * @param {Object} options
     * @param {Object} context
     * @param {String} taskId
     * @constructor
     */
    function IpmiJob(options, context, taskId) {
        IpmiJob.super_.call(this, logger, options, context, taskId);

        this.routingKey = '54edcbb0-437f-44ba-a47c-29446b018052';
        assert.uuid(this.routingKey) ;
    }
    util.inherits(IpmiJob, BaseJob);

    /**
     * @memberOf IpmiJob
     */
    IpmiJob.prototype._run = function run() {
        var self = this;

        return waterline.obms.findByNode(self.options.nodeId, 'ipmi-obm-service', true)
        .then(function(obmSetting) {
            return Promise.props({
                password: obmSetting.config.password,
                host: lookup.macAddressToIp(obmSetting.config.host),
                user: obmSetting.config.user,
                workItemId: self.context.timerId
            });
        })
        .then(function(data) {
            var cmdMap = {
                selInformation: self.collectIpmiSelInformation,
                sel: self.collectIpmiSel,
                sdr: self.collectIpmiSdr,
                chassis: self.collectIpmiChassis,
                driveHealth: self.collectIpmiDriveHealth
            };
            var func = _.get(cmdMap, self.options.command);
            if( func ) {
                return [ func.call(self, data), data ]
            }
            throw new Error('invalid command: ' + self.options.command);  // unreachable
        })
        .spread(function(result, data) {
            data[self.options.command] = result;
            if(data.password) {
                delete data.password;
            }
            return self._publishIpmiCommandResult(self.routingKey, self.options.command, data);
        })
        .then(function() {
            self._done();
        })
        .catch(function(err) {
            logger.error("Failed to initialize job", { error:err });
            self._done(err);
        });
    };

    /**
     * Collect SEL information from IPMI
     * @memberOf IpmiJob
     *
     * @param data
     */
    IpmiJob.prototype.collectIpmiSelInformation = function(data) {
        return ipmitool.selInformation(data.host, data.user, data.password)
        .then(function (sel) {
            return parser.parseSelInformationData(sel);
        });
    };

    /**
     * Collect SEL entries list from IPMI
     * @memberOf IpmiJob
     *
     * @param data
     * @param count
     */
    IpmiJob.prototype.collectIpmiSel = function(data, count) {
        count = count || 25;
        return ipmitool.sel(data.host, data.user, data.password, count)
        .then(function (sel) {
            return parser.parseSelData(sel);
        });
    };

    /**
     * Collect SDR data from IPMI, promise chaining to extract values (parse the SDR)
     * and "store" the samples
     * @memberOf IpmiJob
     *
     * @param machine
     */
    IpmiJob.prototype.collectIpmiSdr = function(machine) {
        var host = machine.host,
            user = machine.user,
            password = machine.password;

        return ipmitool.sensorDataRepository(host, user, password)
        .then(function (sdr) {
            return parser.parseSdrData(sdr);
        });
    };

    /**
     * Collect chassis status data from IPMI
     * @memberOf IpmiJob
     *
     * @param data
     */
    IpmiJob.prototype.collectIpmiChassis = function(data) {
        return ipmitool.chassisStatus(data.host, data.user, data.password)
        .then(function (status) {
            return parser.parseChassisData(status);
        });
    };

    /**
     * Collect drive health status data from IPMI
     * @memberOf IpmiJob
     *
     * @param data
     */
    IpmiJob.prototype.collectIpmiDriveHealth = function(data) {
        return ipmitool.driveHealthStatus(data.host, data.user, data.password)
        .then(function (status) {
            return parser.parseDriveHealthData(status);
        });
    };

    return IpmiJob;
}
