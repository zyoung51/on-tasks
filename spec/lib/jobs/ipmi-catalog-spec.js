// Copyright 2015, Renasar Technologies Inc.
/* jshint node:true */

'use strict';

describe('Ipmi Catalog Job', function () {
    var IpmiCatalogJob;
    var Logger;
    var Promise;
    var uuid;
    var mockWaterline = {
        nodes: {
            findByIdentifier: sinon.stub()
        },
        catalogs: {}
    };

    before(function() {
        helper.setupInjector(
            _.flatten([
                helper.require('/lib/jobs/base-job'),
                helper.require('/lib/jobs/ipmi-catalog'),
                helper.require('/lib/utils/job-utils/command-parser'),
                helper.di.simpleWrapper(mockWaterline, 'Services.Waterline')
            ])
        );

        Promise = helper.injector.get('Promise');
        Logger = helper.injector.get('Logger');
        sinon.stub(Logger.prototype, 'log');
        IpmiCatalogJob = helper.injector.get('Job.Ipmi.Catalog');
        uuid = helper.injector.get('uuid');
    });

    after(function() {
        Logger.prototype.log.restore();
    });

    describe('input validation', function(){
        var job;

        beforeEach('Ipmi catalog job input validation', function(){
            var options = {
                commands: ['test_command'],
                acceptedResponseCodes: [1]
             };
             job = new IpmiCatalogJob(options, { target: 'bc7dab7e8fb7d6abf8e7d6ac' }, uuid.v4());

             mockWaterline.nodes.findByIdentifier.reset();
             mockWaterline.nodes.findByIdentifier.resolves();
        });
        
        it('should fail if node does not exist', function(done) {
            mockWaterline.nodes.findByIdentifier.resolves(null);           
            
            job.run()
            .then(function() {
                done(new Error("Expected job to fail"));
            })
            .catch(function(e) {
                try {
                    expect(e).to.have.property('name').that.equals('AssertionError');
                    expect(e).to.have.property('message').that.equals(
                        'No node for ipmi catalog');
                    done();
                } catch (e) {
                    done();
                }
            });
        });

        it('should fail if ipmi obmSetting does not exist', function(done) {
            var node = {
                id: 'bc7dab7e8fb7d6abf8e7d6ac',
                obmSettings: [
                    {
                        config: {
                        }
                    }
                ]
            };
            mockWaterline.nodes.findByIdentifier.resolves(node);
 
            job.run()
            .then(function() {
                done(new Error("Expected job to fail"));
            })
            .catch(function(e) {
                try {
                    expect(e).to.have.property('name').that.equals('AssertionError');
                    expect(e).to.have.property('message').that.equals(
                        'No ipmi obmSettings for ipmi catalog');
                    done();
                } catch (e) {
                    done();
                }
            });
        });
    });

    describe('run command', function(){
        var job;
  
        beforeEach('Ipmi catalog job run command', function(){
            var options = {
                commands: [
                    'sdr',
                    'lan print'
                ],
                acceptedResponseCodes: [1]
             };
             job = new IpmiCatalogJob(options, { target: 'bc7dab7e8fb7d6abf8e7d6ac' }, uuid.v4());

             mockWaterline.nodes.findByIdentifier.reset();
             mockWaterline.nodes.findByIdentifier.resolves();
        });

        it('should transform command correctly', function() {
            var cmds = [];
            var config = {
                    host: '172.31.128.11',
                    user: 'admin',
                    password: 'password'
                };

            _.forEach(job.commands, function(cmd){
                cmds.push(job.formatCmd(config, cmd));
            });
            
            expect(cmds).to.deep.equal([
                ['-U', 'admin', '-P', 'password', '-H', '172.31.128.11', 'sdr'],
                ['-U', 'admin', '-P', 'password', '-H', '172.31.128.11', 'lan', 'print'], 
            ]);
        });
    });

    describe('handle response', function() {
        var waterline;
        var parser;
        var job;

        before('Ipmi Catalog Job handle response before', function() {
            waterline = helper.injector.get('Services.Waterline');
            parser = helper.injector.get('JobUtils.CommandParser');
            waterline.catalogs.create = sinon.stub();
            sinon.stub(parser, 'parseTasks');
        });

        beforeEach('Ipmi Catalog Job handle response beforeEach', function() {
            var options = {
                commands: [
                    'sdr',
                    'lan print'
                ],
                acceptedResponseCodes: [1]
             };

            waterline.catalogs.create.reset();
            parser.parseTasks.reset();
            job = new IpmiCatalogJob(options, { target: 'testid' }, uuid.v4());
        });

        after('Ipmi Catalog Job handle response after', function() {
            parser.parseTasks.restore();
        });

        it('should create catalog entries for response data', function() {
            parser.parseTasks.returns(Promise.all([
                {
                    store: true,
                    source: 'test-source-1',
                    data: 'test data 1'
                },
                {
                    store: true,
                    source: undefined,
                    data: 'test data 2'
                },
                {
                    store: false,
                    source: 'test-source-3',
                    data: 'test data 3'
                },
                {
                    error: {},
                    source: 'test-error-source'
                }
            ]));
            
            job.handleResponse([])
            .then(function() {
                // Make sure we only catalog objects with store: true and no error
                expect(waterline.catalogs.create).to.have.been.calledTwice;
                expect(waterline.catalogs.create).to.have.been.calledWith({
                    node: job.nodeId,
                    source: 'test-source-1',
                    data: 'test data 1'
                });
                expect(waterline.catalogs.create).to.have.been.calledWith({
                    node: job.nodeId,
                    source: undefined,
                    data: 'test data 2'
                });
            });
        });
    });
});
