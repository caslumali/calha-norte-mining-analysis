/*
 * Calha Norte Mining Analysis - Sentinel-2 Explorer
 *
 * Public Earth Engine app for filtering Sentinel-2 scenes, inspecting them
 * with multiple visualization presets, overlaying territorial context layers,
 * and exporting the current scene using the same map extent and band
 * configuration currently displayed in the canvas.
 *
 * Author:
 * Lucas Lima
 */

var app = {};

// Global state shared across UI callbacks.
app.imageLayer = null;
app.optionalLayerCheckboxes = {};
app.optionalLayerRefs = {};
app.sceneMetadataById = {};
app.defaultVisibleLayerName = 'Calha Norte mining sites';

// Public Calha Norte assets used as optional context layers.
app.assets = {
  'Calha Norte mining sites': ee.FeatureCollection('projects/amazon-mining-analysis/assets/garimpo-cn/garimpos_cn'),
  'Mining zones': ee.FeatureCollection('projects/amazon-mining-analysis/assets/garimpo-cn/zones_garimpo_cn'),
  'Indigenous territories': ee.FeatureCollection('projects/amazon-mining-analysis/assets/garimpo-cn/ti_cn'),
  'Federal protected areas': ee.FeatureCollection('projects/amazon-mining-analysis/assets/garimpo-cn/uc_federal_cn'),
  'State protected areas': ee.FeatureCollection('projects/amazon-mining-analysis/assets/garimpo-cn/uc_estadual_cn'),
  'Hydrography': ee.FeatureCollection('projects/amazon-mining-analysis/assets/garimpo-cn/hid_1000_cn'),
  'Calha Norte boundary': ee.FeatureCollection('projects/amazon-mining-analysis/assets/garimpo-cn/lim_cn')
};

app.assetStyles = {
  'Calha Norte mining sites': {color: 'purple', pointSize: 5, pointShape: 'circle', width: 1, fillColor: '80008040'},
  'Mining zones': {color: 'red', fillColor: 'FF000040', width: 2},
  'Indigenous territories': {color: '800080', fillColor: '80008030', width: 2},
  'Federal protected areas': {color: '0000FF', fillColor: '0000FF25', width: 2},
  'State protected areas': {color: '4A90E2', fillColor: '4A90E225', width: 2},
  'Hydrography': {color: '1E90FF', width: 1},
  'Calha Norte boundary': {color: 'FF8C00', fillColor: '00000000', width: 3}
};

// Core constants used by the application.
app.createConstants = function() {
  app.collectionId = 'COPERNICUS/S2_SR_HARMONIZED';
  app.imageCountLimit = 30;
  app.scaleFactor = 1e-4;
  app.offset = 0;
  app.defaultMinStretch = 0;
  app.defaultMaxStretch = 0.98;
  app.sectionStyle = {margin: '20px 0 0 0'};
  app.helpTextStyle = {margin: '8px 0 -3px 8px', fontSize: '12px', color: 'gray'};
  app.ndviPalette = [
    'FFFFFF', 'CE7E45', 'DF923D', 'F1B555', 'FCD163', '99B718',
    '74A901', '66A000', '529400', '3E8601', '207401', '056201',
    '004C00', '023B01', '012E01', '011D01', '011301'
  ];
  app.visOptions = {
    'Natural color': {
      description: 'True-color composite for general visual inspection.',
      visParams: {gamma: 1.3, min: 500, max: 7000, bands: ['B4', 'B3', 'B2']}
    },
    'Natural color with NIR': {
      description: 'Near-natural rendering with stronger contrast on disturbed surfaces.',
      visParams: {gamma: 1.0, min: [283, 490, 513], max: [1685, 4468, 1800], bands: ['B4', 'B8', 'B3']}
    },
    'Natural color with stretched NIR': {
      description: 'Stretched rendering to emphasize mining disturbance and vegetation stress.',
      visParams: {gamma: 1.0, min: [221, 838, 418], max: [845, 4758, 1070], bands: ['B4', 'B8', 'B3']}
    },
    'False color': {
      description: 'Vegetation appears in red tones and exposed areas become more visible.',
      visParams: {gamma: 1.0, min: 500, max: 7000, bands: ['B5', 'B4', 'B3']}
    },
    'Color infrared': {
      description: 'Infrared composite useful for vegetation and disturbance interpretation.',
      visParams: {gamma: 1.3, min: 500, max: 7000, bands: ['B8', 'B4', 'B3']}
    },
    'Agriculture / moisture': {
      description: 'Useful for contrasting vegetation vigor, moisture, and altered surfaces.',
      visParams: {gamma: 1.3, min: 500, max: 7000, bands: ['B11', 'B8A', 'B2']}
    },
    'SWIR': {
      description: 'Useful for highlighting moisture differences and exposed soils.',
      visParams: {gamma: 1.3, min: 500, max: 7000, bands: ['B12', 'B8', 'B4']}
    },
    'NDVI': {
      description: 'Normalized Difference Vegetation Index.',
      visParams: {min: 0, max: 0.7, palette: app.ndviPalette, bands: ['nd']}
    }
  };
};

// Apply collection-specific scaling before display or export.
app.applyScaleAndOffset = function(image) {
  return image.multiply(app.scaleFactor).add(app.offset);
};

// Add NDVI when the selected visualization requires it.
app.addNdviBand = function(image) {
  return image.addBands(image.normalizedDifference(['B8', 'B4']).rename('nd'));
};

// Build the UI panels shown in the app sidebar.
app.createPanels = function() {
  app.intro = {
    panel: ui.Panel([
      ui.Label({
        value: 'Sentinel-2 Explorer',
        style: {fontWeight: 'bold', fontSize: '24px', margin: '10px 5px'}
      }),
      ui.Label(
        'Interactive app for exploring Sentinel-2 scenes over Calha Norte and exporting the current view for cartographic work.'
      )
    ])
  };

  app.filters = {
    mapView: ui.Checkbox({label: 'Filter by current map view', value: true}),
    startDate: ui.Textbox('YYYY-MM-DD', '2025-11-01'),
    endDate: ui.Textbox('YYYY-MM-DD', '2025-12-31'),
    maxCloudCover: ui.Textbox('0-100', '50'),
    applyButton: ui.Button('Apply filters', app.applyFilters),
    loadingLabel: ui.Label({
      value: 'Loading...',
      style: {stretch: 'vertical', color: 'gray', shown: false}
    }),
    statusLabel: ui.Label({
      value: '',
      style: {margin: '8px 0 0 0', fontSize: '12px', color: 'gray', shown: false}
    })
  };

  app.filters.panel = ui.Panel({
    widgets: [
      ui.Label('1) Filter the collection', {fontWeight: 'bold'}),
      ui.Label('Start date', app.helpTextStyle), app.filters.startDate,
      ui.Label('End date', app.helpTextStyle), app.filters.endDate,
      ui.Label('Max cloud cover (%)', app.helpTextStyle), app.filters.maxCloudCover,
      app.filters.mapView,
      ui.Panel([app.filters.applyButton, app.filters.loadingLabel], ui.Panel.Layout.flow('horizontal')),
      app.filters.statusLabel
    ],
    style: app.sectionStyle
  });

  app.picker = {
    select: ui.Select({
      placeholder: 'Select an image ID',
      onChange: app.refreshMapLayer
    }),
    infoLabel: ui.Label({
      value: '',
      style: {margin: '6px 0 0 0', fontSize: '12px', color: 'gray', shown: false}
    }),
    centerButton: ui.Button('Center on image', function() {
      if (app.imageLayer) {
        Map.centerObject(app.imageLayer.get('eeObject'));
      }
    })
  };

  app.picker.panel = ui.Panel({
    widgets: [
      ui.Label('2) Select an image', {fontWeight: 'bold'}),
      app.picker.select,
      app.picker.centerButton,
      app.picker.infoLabel
    ],
    style: app.sectionStyle
  });

  app.vis = {
    label: ui.Label(),
    select: ui.Select({
      items: Object.keys(app.visOptions),
      onChange: function() {
        var option = app.visOptions[app.vis.select.getValue()];
        if (option) {
          app.vis.label.setValue(option.description);
          app.refreshMapLayer();
        }
      }
    }),
    stretchButton: ui.Button({
      label: 'Stretch 98%',
      onClick: function() {
        app.applyAutoStretch();
      }
    }),
    minSlider: ui.Slider({
      min: 0,
      max: 1,
      value: app.defaultMinStretch,
      step: 0.01,
      onChange: app.refreshMapLayer,
      style: {width: '200px'}
    }),
    maxSlider: ui.Slider({
      min: 0,
      max: 1,
      value: app.defaultMaxStretch,
      step: 0.01,
      onChange: app.refreshMapLayer,
      style: {width: '200px'}
    })
  };

  app.vis.panel = ui.Panel({
    widgets: [
      ui.Label('3) Visualization', {fontWeight: 'bold'}),
      ui.Panel([app.vis.select, app.vis.stretchButton], ui.Panel.Layout.flow('horizontal')),
      app.vis.label,
      ui.Label('Min stretch'), app.vis.minSlider,
      ui.Label('Max stretch'), app.vis.maxSlider
    ],
    style: app.sectionStyle
  });
  app.vis.select.setValue('Natural color');
  app.vis.label.setValue(app.visOptions['Natural color'].description);

  app.optionalLayersPanel = ui.Panel({
    widgets: [
      ui.Label('4) Optional layers', {fontWeight: 'bold'})
    ],
    style: app.sectionStyle
  });

  Object.keys(app.assets).forEach(function(layerName) {
    var checkbox = ui.Checkbox({
      label: layerName,
      value: layerName === app.defaultVisibleLayerName,
      onChange: function(checked) {
        app.updateOptionalLayer(layerName, checked);
      }
    });
    app.optionalLayersPanel.add(checkbox);
    app.optionalLayerCheckboxes[layerName] = checkbox;
  });

  app.export = {
    button: ui.Button({
      label: 'Export current scene to Drive',
      onClick: app.exportCurrentScene
    })
  };

  app.export.panel = ui.Panel({
    widgets: [
      ui.Label('5) Export', {fontWeight: 'bold'}),
      app.export.button
    ],
    style: app.sectionStyle
  });
};

// Helper functions for validation, filtering, scene metadata, and exports.
app.createHelpers = function() {
  app.setStatus = function(message, color) {
    app.filters.statusLabel.setValue(message || '');
    app.filters.statusLabel.style().set('color', color || 'gray');
    app.filters.statusLabel.style().set('shown', !!message);
  };

  app.clearSceneInfo = function() {
    app.picker.infoLabel.setValue('');
    app.picker.infoLabel.style().set('shown', false);
  };

  app.clearImageSelection = function() {
    app.sceneMetadataById = {};
    app.picker.select.items().reset([]);
    app.picker.select.setPlaceholder('No image available');
    app.clearSceneInfo();

    if (app.imageLayer) {
      Map.layers().remove(app.imageLayer);
      app.imageLayer = null;
    }
  };

  app.parseDateInput = function(value, label) {
    if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      throw new Error(label + ' must use the YYYY-MM-DD format.');
    }
    var parsed = new Date(value + 'T00:00:00');
    if (isNaN(parsed.getTime())) {
      throw new Error(label + ' is not a valid date.');
    }
    return parsed;
  };

  app.parsePercentageInput = function(value, label) {
    if (!value || !/^\d+(\.\d+)?$/.test(value)) {
      throw new Error(label + ' must be a number between 0 and 100.');
    }
    var parsed = Number(value);
    if (parsed < 0 || parsed > 100) {
      throw new Error(label + ' must be between 0 and 100.');
    }
    return parsed;
  };

  app.formatDate = function(value) {
    return new Date(value).toISOString().slice(0, 10);
  };

  // Convert the current map canvas into an Earth Engine geometry.
  app.getCurrentMapGeometry = function() {
    var bounds = Map.getBounds();
    return ee.Geometry.BBox(bounds[0], bounds[1], bounds[2], bounds[3]);
  };

  app.setLoadingMode = function(enabled) {
    app.filters.loadingLabel.style().set('shown', enabled);
    [
      app.filters.startDate,
      app.filters.endDate,
      app.filters.maxCloudCover,
      app.filters.mapView,
      app.filters.applyButton,
      app.picker.select,
      app.picker.centerButton,
      app.vis.select,
      app.vis.stretchButton,
      app.vis.minSlider,
      app.vis.maxSlider,
      app.export.button
    ].forEach(function(widget) {
      widget.setDisabled(enabled);
    });
  };

  app.updateSceneInfo = function(imageId) {
    var metadata = app.sceneMetadataById[imageId];
    if (!metadata) {
      app.clearSceneInfo();
      return;
    }
    app.picker.infoLabel.setValue(
      'Sentinel-2 | ' + metadata.date + ' | ' + metadata.cloudiness.toFixed(2) + '% clouds'
    );
    app.picker.infoLabel.style().set('shown', true);
  };

  // Validate the form, filter the collection, and populate the scene picker.
  app.applyFilters = function() {
    var startValue = app.filters.startDate.getValue();
    var endValue = app.filters.endDate.getValue();
    var maxCloudValue = app.filters.maxCloudCover.getValue();
    var startDateJs;
    var endDateJs;
    var maxCloudCover;

    try {
      startDateJs = app.parseDateInput(startValue, 'Start date');
      endDateJs = app.parseDateInput(endValue, 'End date');
      maxCloudCover = app.parsePercentageInput(maxCloudValue, 'Max cloud cover');
    } catch (error) {
      app.setStatus(error.message, 'red');
      ui.alert(error.message);
      return;
    }

    if (startDateJs > endDateJs) {
      app.setStatus('Start date must be earlier than or equal to end date.', 'red');
      ui.alert('Start date must be earlier than or equal to end date.');
      return;
    }

    app.setStatus('');
    app.setLoadingMode(true);

    var filtered = ee.ImageCollection(app.collectionId)
      .filterDate(ee.Date(startValue), ee.Date(endValue))
      .filter(ee.Filter.lte('CLOUDY_PIXEL_PERCENTAGE', maxCloudCover));

    if (app.filters.mapView.getValue()) {
      filtered = filtered.filterBounds(app.getCurrentMapGeometry());
    }

    filtered = filtered
      .map(function(image) {
        return image.set('cloudiness', ee.Number(image.get('CLOUDY_PIXEL_PERCENTAGE')));
      })
      .sort('cloudiness')
      .limit(app.imageCountLimit);

    ee.Dictionary({
      ids: filtered.aggregate_array('system:index'),
      clouds: filtered.aggregate_array('cloudiness'),
      times: filtered.aggregate_array('system:time_start')
    }).evaluate(function(data, error) {
      app.setLoadingMode(false);

      if (error) {
        app.clearImageSelection();
        app.setStatus('Earth Engine error while loading Sentinel-2 scenes.', 'red');
        print('Sentinel-2 scene loading error:', error);
        return;
      }

      if (!data || !data.ids || data.ids.length === 0) {
        app.clearImageSelection();
        app.setStatus('No Sentinel-2 scenes were found for the selected filters.', 'red');
        return;
      }

      app.sceneMetadataById = {};
      var ids = data.ids.map(function(id, index) {
        app.sceneMetadataById[id] = {
          cloudiness: data.clouds[index],
          date: app.formatDate(data.times[index])
        };
        return id + ' (' + data.clouds[index].toFixed(2) + '% clouds)';
      });

      app.picker.select.items().reset(ids);
      app.picker.select.setPlaceholder('Select an image ID');
      app.setStatus('Loaded ' + ids.length + ' candidate Sentinel-2 scenes.', 'gray');
      app.picker.select.setValue(ids[0]);
    });
  };

  // Rebuild the selected Sentinel-2 scene and derive NDVI when needed.
  app.buildCurrentImage = function(imageId) {
    var image = app.applyScaleAndOffset(ee.Image(app.collectionId + '/' + imageId));
    if (app.vis.select.getValue() === 'NDVI') {
      image = app.addNdviBand(image);
    }
    return image;
  };

  // Compute a 2-98% stretch for the current scene within the current map view.
  // This avoids slowing down image loading while still giving a quick one-click enhancement.
  app.applyAutoStretch = function() {
    var selected = app.picker.select.getValue();
    if (!selected) {
      ui.alert('Select an image before applying the stretch.');
      return;
    }

    var imageId = selected.split(' ')[0];
    var image = app.buildCurrentImage(imageId);
    var visOption = app.visOptions[app.vis.select.getValue()];
    var selectedBands = visOption.visParams.bands || [];
    var geometry = app.getCurrentMapGeometry();

    app.setStatus('Computing 2-98% stretch for the current view...', 'gray');
    app.setLoadingMode(true);

    image.select(selectedBands).reduceRegion({
      reducer: ee.Reducer.percentile([2, 98]),
      geometry: geometry,
      scale: 10,
      bestEffort: true,
      maxPixels: 1e7
    }).evaluate(function(stats, error) {
      app.setLoadingMode(false);

      if (error) {
        app.setStatus('Stretch failed because Earth Engine returned an error.', 'red');
        print('Sentinel-2 stretch error:', error);
        return;
      }

      if (!stats) {
        app.setStatus('Stretch failed: no statistics were returned for the current view.', 'red');
        return;
      }

      var mins = [];
      var maxs = [];

      selectedBands.forEach(function(bandName) {
        var p2 = stats[bandName + '_p2'];
        var p98 = stats[bandName + '_p98'];

        if (typeof p2 === 'number' && typeof p98 === 'number' && isFinite(p2) && isFinite(p98)) {
          mins.push(p2);
          maxs.push(p98);
        }
      });

      if (mins.length === 0 || maxs.length === 0) {
        app.setStatus('Stretch failed: no valid percentile values were found.', 'red');
        return;
      }

      var minValue = Math.max(0, Math.min.apply(null, mins));
      var maxValue = Math.max.apply(null, maxs);

      if (!(maxValue > minValue)) {
        app.setStatus('Stretch failed: computed range is invalid.', 'red');
        return;
      }

      app.vis.minSlider.setValue(minValue);
      app.vis.maxSlider.setValue(maxValue);
      app.setStatus('Stretch updated from the current map extent.', 'green');
      app.refreshMapLayer();
    });
  };

  // Refresh the displayed map layer after a scene or visualization change.
  app.refreshMapLayer = function() {
    var selected = app.picker.select.getValue();
    if (!selected) {
      return;
    }

    var imageId = selected.split(' ')[0];
    var image = app.buildCurrentImage(imageId);
    var visOption = app.visOptions[app.vis.select.getValue()];

    app.updateSceneInfo(imageId);

    if (app.imageLayer) {
      Map.layers().remove(app.imageLayer);
    }

    app.imageLayer = ui.Map.Layer(image, {
      bands: visOption.visParams.bands,
      palette: visOption.visParams.palette,
      gamma: visOption.visParams.gamma,
      min: app.vis.minSlider.getValue(),
      max: app.vis.maxSlider.getValue()
    }, 'Image layer');

    Map.layers().insert(0, app.imageLayer);
  };

  // Export the current scene with the same extent and displayed band configuration.
  app.exportCurrentScene = function() {
    var selected = app.picker.select.getValue();
    if (!selected) {
      ui.alert('Select an image before exporting.');
      return;
    }

    var imageId = selected.split(' ')[0];
    var image = app.buildCurrentImage(imageId);
    var visOption = app.visOptions[app.vis.select.getValue()];
    var exportRegion = app.getCurrentMapGeometry();
    var metadata = app.sceneMetadataById[imageId];
    var exportName = 'sentinel2_' + imageId.replace(/\//g, '_');

    Export.image.toDrive({
      image: image.select(visOption.visParams.bands).clip(exportRegion),
      description: exportName,
      region: exportRegion,
      scale: 10,
      maxPixels: 1e9
    });

    app.setStatus(
      'Export started for Sentinel-2 (' + metadata.date + ') using the current map extent.',
      'green'
    );
  };
};

// Toggle optional layers on the map.
app.updateOptionalLayer = function(layerName, visible) {
  if (app.optionalLayerRefs[layerName]) {
    Map.layers().remove(app.optionalLayerRefs[layerName]);
    app.optionalLayerRefs[layerName] = null;
  }

  if (visible) {
    var layer = ui.Map.Layer(app.assets[layerName], app.assetStyles[layerName] || {}, layerName);
    Map.layers().add(layer);
    app.optionalLayerRefs[layerName] = layer;
  }
};

// Boot sequence.
app.boot = function() {
  app.createConstants();
  app.createHelpers();
  app.createPanels();

  var mainPanel = ui.Panel({
    widgets: [
      app.intro.panel,
      app.filters.panel,
      app.picker.panel,
      app.vis.panel,
      app.optionalLayersPanel,
      app.export.panel
    ],
    style: {width: '340px', padding: '8px'}
  });

  Map.setCenter(-55.5, 0.1, 7);
  ui.root.insert(0, mainPanel);
  app.updateOptionalLayer(app.defaultVisibleLayerName, true);
  app.applyFilters();
};

app.boot();
